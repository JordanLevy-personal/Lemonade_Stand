// @vitest-environment node

import { describe, expect, it } from 'vitest'

import type { SimulationTelemetry } from '../src/game/types'
import type {
  DailyPlan,
  FactionSelection,
  Inventory,
  MarketBasePrices,
  PlayerState,
  RoomState,
  Weather,
} from './contracts'
import { RoomManager, type RoomGameHooks } from './room-manager'

const FACTION_ALPHA: FactionSelection = {
  id: 'alpha',
  name: 'Alpha',
  accentColor: '#f3c84b',
}

const FACTION_BETA: FactionSelection = {
  id: 'beta',
  name: 'Beta',
  accentColor: '#2f8fda',
}

const DEFAULT_PLAN: DailyPlan = {
  purchases: {
    lemons: 3,
    sugar: 3,
    ice: 3,
  },
  recipe: {
    lemons: 2,
    sugar: 2,
    ice: 2,
  },
  price: 1.5,
}

function emptyInventory(): Inventory {
  return {
    lemons: 0,
    sugar: 0,
    ice: 0,
  }
}

function createHooks(): RoomGameHooks {
  return {
    createInitialState(seed: number) {
      return {
        customerRoster: [
          {
            id: `customer-${seed}`,
            tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
            standHistory: {},
          },
        ],
        rngSeed: seed + 100,
      }
    },
    createDay(day: number): {
      weather: Weather
      marketBasePrices: MarketBasePrices
    } {
      return {
        weather: day % 2 === 0 ? 'hot' : 'sunny',
        marketBasePrices: {
          lemons: 0.4,
          sugar: 0.2,
          ice: 0.1,
        },
      }
    },
    startSimulation(room: RoomState, simulationStartAt: number): { room: RoomState; telemetry: SimulationTelemetry } {
      return {
        room: {
          ...room,
          phase: 'simulating',
          simulation: {
            customerEvents: [
              {
                id: 'event-1',
                arrivalOffsetMs: 0,
                willingnessToPay: 2,
                chosenPlayerId: room.players[0]?.id ?? null,
                outcome: 'buy',
                salePrice: 1.5,
                satisfaction: 0.9,
              },
            ],
            simulationStartAt,
            durationMs: 6000,
          },
          players: room.players.map((player, index) => ({
            ...player,
            dailyResults:
              index === 0
                ? {
                    cupsSold: 1,
                    revenue: 1.5,
                    satisfaction: 0.9,
                    reputationDelta: 2,
                    customersWon: 1,
                    customersSkipped: 0,
                    customersSoldOut: 0,
                  }
                : null,
          })),
        },
        telemetry: {
          customerProfiles: [],
          customerEvents: [],
          customerOfferScores: [],
        },
      }
    },
    startNextDay(room: RoomState): RoomState {
      return {
        ...room,
        day: room.day + 1,
        phase: 'planning',
        weather: 'hot',
        simulation: null,
        requestedNextDayPlayerIds: [],
        players: room.players.map((player) => ({
          ...player,
          dailyPlan: null,
          dailyResults: null,
          hasSubmittedPlan: false,
        })),
      }
    },
    createPlayerDefaults(): Pick<PlayerState, 'money' | 'inventory' | 'reputation'> {
      return {
        money: 20,
        inventory: emptyInventory(),
        reputation: 50,
      }
    },
  }
}

function createManager(now = 10_000): RoomManager {
  return new RoomManager(createHooks(), () => now)
}

describe('RoomManager', () => {
  it('creates a lobby room with the host connected', () => {
    const manager = createManager()

    const room = manager.createRoom({
      roomId: 'ROOM01',
      playerId: 'host-1',
      name: 'Host',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-host',
    })

    expect(room.roomId).toBe('ROOM01')
    expect(room.hostPlayerId).toBe('host-1')
    expect(room.phase).toBe('lobby')
    expect(room.players).toHaveLength(1)
    expect(room.players[0]?.connectionStatus).toBe('connected')
  })

  it('moves to planning when the second player joins', () => {
    const manager = createManager()
    manager.createRoom({
      roomId: 'ROOM01',
      playerId: 'host-1',
      name: 'Host',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-host',
    })

    const room = manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest',
    })

    expect(room.phase).toBe('planning')
    expect(room.players).toHaveLength(2)
    expect(room.players[1]?.id).toBe('room01-player-2')
  })

  it('starts simulation automatically once both players submit plans', () => {
    const manager = createManager(12_000)
    manager.createRoom({
      roomId: 'ROOM01',
      playerId: 'host-1',
      name: 'Host',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-host',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest',
    })

    const firstResult = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'host-1',
      plan: DEFAULT_PLAN,
    })
    const secondResult = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'room01-player-2',
      plan: DEFAULT_PLAN,
    })

    expect(firstResult.simulationStartedAt).toBeNull()
    expect(secondResult.simulationStartedAt).toBe(13_000)
    expect(secondResult.room.phase).toBe('simulating')
    expect(secondResult.room.simulation?.simulationStartAt).toBe(13_000)
  })

  it('pauses on disconnect and resumes the previous phase on reconnect', () => {
    const manager = createManager()
    manager.createRoom({
      roomId: 'ROOM01',
      playerId: 'host-1',
      name: 'Host',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-host',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest',
    })

    const paused = manager.disconnect({
      roomId: 'ROOM01',
      playerId: 'host-1',
    })
    const resumed = manager.joinRoom({
      roomId: 'ROOM01',
      playerId: 'host-1',
      name: 'Host',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-host-reconnect',
    })

    expect(paused.phase).toBe('paused')
    expect(paused.pausedFromPhase).toBe('planning')
    expect(paused.players[0]?.connectionStatus).toBe('disconnected')
    expect(resumed.phase).toBe('planning')
    expect(resumed.pausedFromPhase).toBeNull()
  })

  it('reclaims a disconnected seat by matching name and faction when playerId is missing', () => {
    const manager = createManager()
    manager.createRoom({
      roomId: 'ROOM01',
      playerId: 'host-1',
      name: 'Host',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-host',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest',
    })

    manager.disconnect({
      roomId: 'ROOM01',
      playerId: 'room01-player-2',
    })

    const resumed = manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-reconnect',
    })

    expect(resumed.players).toHaveLength(2)
    expect(resumed.players[1]?.id).toBe('room01-player-2')
    expect(resumed.players[1]?.connectionStatus).toBe('connected')
  })

  it('waits for both players to request the next day before resetting planning', () => {
    const manager = createManager()
    manager.createRoom({
      roomId: 'ROOM01',
      playerId: 'host-1',
      name: 'Host',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-host',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest',
    })
    const first = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'host-1',
      plan: DEFAULT_PLAN,
    })
    const second = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'room01-player-2',
      plan: DEFAULT_PLAN,
    })
    expect(first.room.phase).toBe('planning')
    expect(second.room.phase).toBe('simulating')
    manager.completeSimulation('ROOM01')

    const afterFirstRequest = manager.requestNextDay({
      roomId: 'ROOM01',
      playerId: 'host-1',
    })
    const afterSecondRequest = manager.requestNextDay({
      roomId: 'ROOM01',
      playerId: 'room01-player-2',
    })

    expect(afterFirstRequest.phase).toBe('results')
    expect(afterFirstRequest.requestedNextDayPlayerIds).toEqual(['host-1'])
    expect(afterSecondRequest.phase).toBe('planning')
    expect(afterSecondRequest.day).toBe(2)
    expect(afterSecondRequest.players.every((player) => player.hasSubmittedPlan === false)).toBe(true)
  })
})

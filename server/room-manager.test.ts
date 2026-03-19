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
  RunUpgradeId,
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
    createDay(day: number): {
      weather: Weather
      marketBasePrices: MarketBasePrices
      customerRoster: NonNullable<RoomState['customerRoster']>
      rngSeed: number
    } {
      return {
        weather: day % 2 === 0 ? 'hot' : 'sunny',
        marketBasePrices: {
          lemons: 0.4,
          sugar: 0.2,
          ice: 0.1,
        },
        customerRoster: [
          {
            id: `customer-${day}`,
            tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
            standHistory: {},
          },
        ],
        rngSeed: day,
      }
    },
    getUpgradeCost(upgradeId: RunUpgradeId): number {
      if (upgradeId !== 'recipe-feedback-hints') {
        throw new Error('Unknown upgrade.')
      }

      return 25
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
                customerId: 'customer-1',
                customerIndex: 0,
                spawnAt: 0,
                outcomeAt: 1_500,
                exitAt: 2_000,
                standStops: [
                  {
                    playerId: room.players[0]?.id ?? 'host-1',
                    arriveAt: 500,
                    departAt: 1_500,
                  },
                ],
                willingnessToPay: 2,
                targetPlayerId: room.players[0]?.id ?? null,
                outcome: 'buy',
                salePrice: 1.5,
                satisfaction: 0.9,
                lane: 0,
                xJitter: 0,
                yJitter: 0,
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
            history:
              index === 0
                ? [
                    {
                      day: room.day,
                      revenue: 1.5,
                      purchaseCost: 0.9,
                      profit: 0.6,
                      endingMoney: player.money + 1.5,
                      reputationAfter: player.reputation + 2,
                      cupsSold: 1,
                      satisfaction: 0.9,
                      recipeSnapshot: {
                        lemons: 2,
                        sugar: 2,
                        ice: 2,
                      },
                    },
                  ]
                : [],
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
    createPlayerDefaults(): Pick<PlayerState, 'money' | 'inventory' | 'reputation' | 'ownedUpgrades'> {
      return {
        money: 20,
        inventory: emptyInventory(),
        reputation: 50,
        ownedUpgrades: {
          recipeFeedbackHints: false,
        },
      }
    },
  }
}

function createRichManager(now = 10_000): RoomManager {
  return new RoomManager(
    {
      ...createHooks(),
      createPlayerDefaults() {
        return {
          money: 30,
          inventory: emptyInventory(),
          reputation: 50,
          ownedUpgrades: {
            recipeFeedbackHints: false,
          },
        }
      },
    },
    () => now,
  )
}

function createManager(now = 10_000): RoomManager {
  return new RoomManager(createHooks(), () => now)
}

function createMultiplayerRoom(manager: RoomManager): RoomState {
  return manager.createRoom({
    roomId: 'ROOM01',
    playerId: 'host-1',
    name: 'Host',
    faction: FACTION_ALPHA,
    analyticsPlayerId: 'analytics-host',
    gameMode: 'multiplayer',
    targetPlayerCount: 2,
    runLengthDays: 14,
  } as unknown as Parameters<RoomManager['createRoom']>[0])
}

function createScaledMultiplayerRoom(
  manager: RoomManager,
  targetPlayerCount: number,
): RoomState {
  return manager.createRoom({
    roomId: 'ROOM01',
    playerId: 'host-1',
    name: 'Host',
    faction: FACTION_ALPHA,
    analyticsPlayerId: 'analytics-host',
    gameMode: 'multiplayer',
    targetPlayerCount,
    runLengthDays: 14,
  })
}

function createSingleplayerRoom(manager: RoomManager): RoomState {
  return manager.createRoom({
    roomId: 'SOLO1',
    playerId: 'solo-host',
    name: 'Solo Host',
    faction: FACTION_ALPHA,
    analyticsPlayerId: 'analytics-solo-host',
    gameMode: 'singleplayer',
    targetPlayerCount: 1,
    runLengthDays: 14,
  } as unknown as Parameters<RoomManager['createRoom']>[0])
}

function overwriteStoredRoom(manager: RoomManager, room: RoomState): void {
  ;((manager as unknown as { rooms: Map<string, RoomState> }).rooms).set(room.roomId, room)
}

describe('RoomManager', () => {
  it('creates a lobby room with the host connected', () => {
    const manager = createManager()

    const room = createMultiplayerRoom(manager)

    expect(room.roomId).toBe('ROOM01')
    expect(room.hostPlayerId).toBe('host-1')
    expect(room.phase).toBe('lobby')
    expect(room.gameMode).toBe('multiplayer')
    expect(room.targetPlayerCount).toBe(2)
    expect((room as RoomState & { runLengthDays?: number }).runLengthDays).toBe(14)
    expect(room.players).toHaveLength(1)
    expect(room.players[0]?.connectionStatus).toBe('connected')
  })

  it('creates a planning singleplayer room immediately', () => {
    const manager = createManager()

    const room = createSingleplayerRoom(manager)

    expect(room.phase).toBe('planning')
    expect(room.gameMode).toBe('singleplayer')
    expect(room.targetPlayerCount).toBe(1)
    expect(room.players).toHaveLength(1)
  })

  it('moves to planning when the second player joins', () => {
    const manager = createManager()
    createMultiplayerRoom(manager)

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

  it('keeps a four-player room in the lobby until the fourth player joins', () => {
    const manager = createManager()
    createScaledMultiplayerRoom(manager, 4)

    const secondPlayerRoom = manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 2',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-2',
    })
    const thirdPlayerRoom = manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 3',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-guest-3',
    })
    const fourthPlayerRoom = manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 4',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-4',
    })

    expect(secondPlayerRoom.phase).toBe('lobby')
    expect(secondPlayerRoom.players).toHaveLength(2)
    expect(thirdPlayerRoom.phase).toBe('lobby')
    expect(thirdPlayerRoom.players).toHaveLength(3)
    expect(fourthPlayerRoom.phase).toBe('planning')
    expect(fourthPlayerRoom.players).toHaveLength(4)
  })

  it('keeps a three-player room in the lobby until the third player joins', () => {
    const manager = createManager()
    createScaledMultiplayerRoom(manager, 3)

    const secondPlayerRoom = manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 2',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-2',
    })
    const thirdPlayerRoom = manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 3',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-guest-3',
    })

    expect(secondPlayerRoom.phase).toBe('lobby')
    expect(secondPlayerRoom.players).toHaveLength(2)
    expect(thirdPlayerRoom.phase).toBe('planning')
    expect(thirdPlayerRoom.players).toHaveLength(3)
  })

  it('purchases the recipe feedback hint upgrade during planning and deducts the cost', () => {
    const manager = createRichManager()
    createMultiplayerRoom(manager)
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest',
    })

    const room = manager.purchaseUpgrade({
      roomId: 'ROOM01',
      playerId: 'host-1',
      upgradeId: 'recipe-feedback-hints',
    })

    const host = room.players.find((player) => player.id === 'host-1')

    expect(host?.money).toBe(5)
    expect(host?.ownedUpgrades?.recipeFeedbackHints).toBe(true)
  })

  it('starts simulation automatically once both players submit plans', () => {
    const manager = createManager(12_000)
    createMultiplayerRoom(manager)
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

  it('waits for all four players before starting simulation', () => {
    const manager = createManager(12_000)
    createScaledMultiplayerRoom(manager, 4)
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 2',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-2',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 3',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-guest-3',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 4',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-4',
    })

    manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'host-1',
      plan: DEFAULT_PLAN,
    })
    manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'room01-player-2',
      plan: DEFAULT_PLAN,
    })
    const thirdResult = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'room01-player-3',
      plan: DEFAULT_PLAN,
    })
    const fourthResult = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'room01-player-4',
      plan: DEFAULT_PLAN,
    })

    expect(thirdResult.room.phase).toBe('planning')
    expect(thirdResult.simulationStartedAt).toBeNull()
    expect(fourthResult.room.phase).toBe('simulating')
    expect(fourthResult.simulationStartedAt).toBe(13_000)
  })

  it('waits for all three players before starting simulation', () => {
    const manager = createManager(12_000)
    createScaledMultiplayerRoom(manager, 3)
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 2',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-2',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 3',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-guest-3',
    })

    manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'host-1',
      plan: DEFAULT_PLAN,
    })
    const secondResult = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'room01-player-2',
      plan: DEFAULT_PLAN,
    })
    const thirdResult = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'room01-player-3',
      plan: DEFAULT_PLAN,
    })

    expect(secondResult.room.phase).toBe('planning')
    expect(secondResult.simulationStartedAt).toBeNull()
    expect(thirdResult.room.phase).toBe('simulating')
    expect(thirdResult.simulationStartedAt).toBe(13_000)
  })

  it('starts simulation immediately once the solo player submits a plan', () => {
    const manager = createManager(12_000)
    createSingleplayerRoom(manager)

    const result = manager.submitPlan({
      roomId: 'SOLO1',
      playerId: 'solo-host',
      plan: DEFAULT_PLAN,
    })

    expect(result.simulationStartedAt).toBe(13_000)
    expect(result.room.phase).toBe('simulating')
    expect(result.room.simulation?.simulationStartAt).toBe(13_000)
  })

  it('pauses on disconnect and resumes the previous phase on reconnect', () => {
    const manager = createManager()
    createMultiplayerRoom(manager)
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
    createMultiplayerRoom(manager)
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

  it('rejects joins for a singleplayer room', () => {
    const manager = createManager()
    createSingleplayerRoom(manager)

    expect(() =>
      manager.joinRoom({
        roomId: 'SOLO1',
        name: 'Guest',
        faction: FACTION_BETA,
        analyticsPlayerId: 'analytics-guest',
      }),
    ).toThrow('That room is already full.')
  })

  it('waits for both players to request the next day before resetting planning', () => {
    const manager = createManager()
    createMultiplayerRoom(manager)
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

  it('waits for all four players to request the next day before resetting planning', () => {
    const manager = createManager()
    createScaledMultiplayerRoom(manager, 4)
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 2',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-2',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 3',
      faction: FACTION_ALPHA,
      analyticsPlayerId: 'analytics-guest-3',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest 4',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest-4',
    })

    for (const playerId of ['host-1', 'room01-player-2', 'room01-player-3', 'room01-player-4']) {
      manager.submitPlan({
        roomId: 'ROOM01',
        playerId,
        plan: DEFAULT_PLAN,
      })
    }
    manager.completeSimulation('ROOM01')

    const requestOne = manager.requestNextDay({
      roomId: 'ROOM01',
      playerId: 'host-1',
    })
    const requestTwo = manager.requestNextDay({
      roomId: 'ROOM01',
      playerId: 'room01-player-2',
    })
    const requestThree = manager.requestNextDay({
      roomId: 'ROOM01',
      playerId: 'room01-player-3',
    })
    const requestFour = manager.requestNextDay({
      roomId: 'ROOM01',
      playerId: 'room01-player-4',
    })

    expect(requestOne.phase).toBe('results')
    expect(requestOne.requestedNextDayPlayerIds).toEqual(['host-1'])
    expect(requestTwo.requestedNextDayPlayerIds).toEqual(['host-1', 'room01-player-2'])
    expect(requestThree.requestedNextDayPlayerIds).toEqual(['host-1', 'room01-player-2', 'room01-player-3'])
    expect(requestFour.phase).toBe('planning')
    expect(requestFour.day).toBe(2)
  })

  it('rejects unsupported multiplayer player counts', () => {
    const manager = createManager()

    expect(() => createScaledMultiplayerRoom(manager, 1)).toThrow()
    expect(() => createScaledMultiplayerRoom(manager, 5)).toThrow()
  })

  it('advances to the next day immediately after the solo player requests it', () => {
    const manager = createManager()
    createSingleplayerRoom(manager)
    manager.submitPlan({
      roomId: 'SOLO1',
      playerId: 'solo-host',
      plan: DEFAULT_PLAN,
    })
    manager.completeSimulation('SOLO1')

    const nextDayRoom = manager.requestNextDay({
      roomId: 'SOLO1',
      playerId: 'solo-host',
    })

    expect(nextDayRoom.phase).toBe('planning')
    expect(nextDayRoom.day).toBe(2)
    expect(nextDayRoom.requestedNextDayPlayerIds).toEqual([])
  })

  it('marks the run complete on the final multiplayer day using reputation as the tiebreaker', () => {
    const manager = createManager()
    createMultiplayerRoom(manager)
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: FACTION_BETA,
      analyticsPlayerId: 'analytics-guest',
    })

    const room = manager.getRoom('ROOM01')!
    overwriteStoredRoom(manager, {
      ...room,
      day: 14,
      phase: 'simulating',
      runLengthDays: 14,
      isGameComplete: false,
      finalOutcome: null,
      simulation: {
        customerEvents: [],
        simulationStartAt: 12_000,
        durationMs: 6_000,
      },
      players: room.players.map((player) =>
        player.id === 'host-1'
          ? {
              ...player,
              money: 32,
              reputation: 54,
              dailyResults: {
                cupsSold: 8,
                revenue: 12,
                satisfaction: 0.7,
                reputationDelta: 2,
                customersWon: 8,
                customersSkipped: 4,
                customersSoldOut: 0,
              },
            }
          : {
              ...player,
              money: 32,
              reputation: 61,
              dailyResults: {
                cupsSold: 10,
                revenue: 15,
                satisfaction: 0.8,
                reputationDelta: 3,
                customersWon: 10,
                customersSkipped: 3,
                customersSoldOut: 0,
              },
            },
      ),
    } as RoomState)

    const completedRoom = manager.completeSimulation('ROOM01') as RoomState & {
      runLengthDays: number
      isGameComplete: boolean
      finalOutcome: { winnerPlayerIds: string[]; decidedBy: string } | null
    }

    expect(completedRoom.phase).toBe('results')
    expect(completedRoom.isGameComplete).toBe(true)
    expect(completedRoom.finalOutcome).toEqual({
      winnerPlayerIds: ['room01-player-2'],
      decidedBy: 'reputation',
    })
  })

  it('rejects next-day requests once the run is complete', () => {
    const manager = createManager()
    createSingleplayerRoom(manager)

    const room = manager.getRoom('SOLO1')!
    overwriteStoredRoom(manager, {
      ...room,
      day: 14,
      phase: 'results',
      runLengthDays: 14,
      isGameComplete: true,
      finalOutcome: {
        winnerPlayerIds: ['solo-host'],
        decidedBy: 'money',
      },
      players: room.players.map((player) => ({
        ...player,
        dailyResults: {
          cupsSold: 11,
          revenue: 16.5,
          satisfaction: 0.74,
          reputationDelta: 3,
          customersWon: 11,
          customersSkipped: 2,
          customersSoldOut: 0,
        },
      })),
    } as RoomState)

    expect(() =>
      manager.requestNextDay({
        roomId: 'SOLO1',
        playerId: 'solo-host',
      }),
    ).toThrow('This run is already complete.')
  })
})

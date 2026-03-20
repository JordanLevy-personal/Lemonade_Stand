import { defaultBalanceConfig } from '../src/game/balance'
import {
  beginNextDay,
  createRoom as createGameRoom,
  emptyInventory,
  enterResultsPhase,
  joinRoom as joinGameRoom,
  setPlayerReady,
  startSimulationWithTelemetry,
  updatePlayerPlan,
} from '../src/game/engine'
import {
  defaultOwnedUpgrades,
  getUpgradeCost,
} from '../src/game/upgrades'
import type { FactionDefinition, RoomState as GameRoomState } from '../src/game/types'
import type {
  DailyResults,
  MarketBasePrices,
  PlayerState,
  RoomState,
  Weather,
} from './contracts'
import type { RoomGameHooks } from './room-manager'

function toGameFaction(serverFaction: PlayerState['faction']): FactionDefinition {
  return {
    id: serverFaction.id,
    name: serverFaction.name,
    accent: serverFaction.accentColor,
    banner: serverFaction.name,
  }
}

function toServerResults(
  results: GameRoomState['players'][number]['dailyResults'],
): DailyResults {
  return {
    cupsSold: results.cupsSold,
    revenue: results.revenue,
    satisfaction: results.satisfaction,
    reputationDelta: results.reputationDelta,
    customersWon: results.customersWon,
    customersSkipped: results.customersSkipped,
    customersSoldOut: results.customersSoldOut,
  }
}

function toGameRoom(room: RoomState): GameRoomState {
  return {
    version: 2,
    roomId: room.roomId,
    hostPlayerId: room.hostPlayerId,
    gameMode: room.gameMode,
    day: room.day,
    weather: room.weather,
    phase: room.phase === 'paused' ? 'planning' : room.phase,
    pausedPhase: room.pausedFromPhase,
    players: room.players.map((player) => ({
      id: player.id,
      name: player.name,
      faction: toGameFaction(player.faction),
      sessionId: player.id,
      money: player.money,
      inventory: player.inventory,
      reputation: player.reputation,
      ownedUpgrades: player.ownedUpgrades ?? defaultOwnedUpgrades(),
      isReady: player.hasSubmittedPlan,
      connectionStatus: player.connectionStatus,
      dailyPlan:
        player.dailyPlan ?? {
          purchases: emptyInventory(),
          recipe: defaultBalanceConfig.defaultRecipe,
          price: defaultBalanceConfig.defaultPrice,
        },
      dailyResults: player.dailyResults === null
        ? {
            cupsSold: 0,
            revenue: 0,
            satisfaction: 0,
            reputationDelta: 0,
            customersWon: 0,
            customersSkipped: 0,
            customersSoldOut: 0,
          }
        : {
            cupsSold: player.dailyResults.cupsSold,
            revenue: player.dailyResults.revenue,
            satisfaction: player.dailyResults.satisfaction,
            reputationDelta: player.dailyResults.reputationDelta,
            customersWon: player.dailyResults.customersWon,
            customersSkipped: player.dailyResults.customersSkipped,
            customersSoldOut: player.dailyResults.customersSoldOut,
          },
      history: player.history.map((entry) => ({
        day: entry.day,
        revenue: entry.revenue,
        purchaseCost: entry.purchaseCost,
        profit: entry.profit,
        endingMoney: entry.endingMoney,
        reputationAfter: entry.reputationAfter,
        cupsSold: entry.cupsSold,
        satisfaction: entry.satisfaction,
        recipeSnapshot: entry.recipeSnapshot ?? defaultBalanceConfig.defaultRecipe,
      })),
    })),
    marketBasePrices: room.marketBasePrices,
    simulation:
      room.simulation === null
        ? null
        : {
            events: room.simulation.customerEvents.map((event) => ({
              id: event.id,
              customerId: event.customerId,
              customerIndex: event.customerIndex,
              spawnAt: event.spawnAt,
              outcomeAt: event.outcomeAt,
              exitAt: event.exitAt,
              standStops: event.standStops.map((stop) => ({
                playerId: stop.playerId,
                arriveAt: stop.arriveAt,
                departAt: stop.departAt,
              })),
              targetPlayerId: event.targetPlayerId,
              outcome: event.outcome,
              salePrice: event.salePrice,
              satisfaction: event.satisfaction,
              willingnessToPay: event.willingnessToPay,
              lane: event.lane,
              xJitter: event.xJitter,
              yJitter: event.yJitter,
              feedbackHintsByPlayerId: event.feedbackHintsByPlayerId,
            })),
            durationMs: room.simulation.durationMs,
            totalCustomers: room.simulation.customerEvents.length,
          },
    customerRoster: room.customerRoster ?? [],
    maxPlayers: room.targetPlayerCount,
    rng: {
      seed: room.rngSeed ?? Math.max(1, room.day * 7_919),
    },
  }
}

function toServerRoom(gameRoom: GameRoomState): RoomState {
  return {
    roomId: gameRoom.roomId,
    hostPlayerId: gameRoom.hostPlayerId,
    gameMode: gameRoom.gameMode,
    targetPlayerCount: gameRoom.maxPlayers,
    day: gameRoom.day,
    runLengthDays: 14,
    isGameComplete: false,
    finalOutcome: null,
    weather: gameRoom.weather ?? 'sunny',
    phase: gameRoom.phase,
    players: gameRoom.players.map((player) => ({
      id: player.id,
      name: player.name,
      faction: {
        id: player.faction.id,
        name: player.faction.name,
        accentColor: player.faction.accent,
      },
      money: player.money,
      inventory: player.inventory,
      reputation: player.reputation,
      ownedUpgrades: player.ownedUpgrades ?? defaultOwnedUpgrades(),
      dailyPlan: player.dailyPlan,
      dailyResults: toServerResults(player.dailyResults),
      history: player.history.map((entry) => ({
        day: entry.day,
        revenue: entry.revenue,
        purchaseCost: entry.purchaseCost,
        profit: entry.profit,
        endingMoney: entry.endingMoney,
        reputationAfter: entry.reputationAfter,
        cupsSold: entry.cupsSold,
        satisfaction: entry.satisfaction,
        recipeSnapshot: entry.recipeSnapshot,
      })),
      hasSubmittedPlan: player.isReady,
      connectionStatus: player.connectionStatus,
    })),
    marketBasePrices: gameRoom.marketBasePrices ?? emptyInventory(),
    simulation:
      gameRoom.simulation === null
        ? null
        : {
            customerEvents: gameRoom.simulation.events.map((event) => ({
              id: event.id,
              customerId: event.customerId,
              customerIndex: event.customerIndex,
              spawnAt: event.spawnAt,
              outcomeAt: event.outcomeAt,
              exitAt: event.exitAt,
              standStops: event.standStops.map((stop) => ({
                playerId: stop.playerId,
                arriveAt: stop.arriveAt,
                departAt: stop.departAt,
              })),
              willingnessToPay: event.willingnessToPay,
              targetPlayerId: event.targetPlayerId,
              outcome: event.outcome,
              salePrice: event.salePrice,
              satisfaction: event.satisfaction,
              lane: event.lane,
              xJitter: event.xJitter,
              yJitter: event.yJitter,
              feedbackHintsByPlayerId: event.feedbackHintsByPlayerId,
            })),
            simulationStartAt: null,
            durationMs: gameRoom.simulation.durationMs,
          },
    pausedFromPhase: gameRoom.pausedPhase,
    requestedNextDayPlayerIds: [],
    customerRoster: gameRoom.customerRoster,
    rngSeed: gameRoom.rng.seed,
  }
}

function createPreviewDay(day: number): {
  weather: Weather
  marketBasePrices: MarketBasePrices
  customerRoster: NonNullable<RoomState['customerRoster']>
  rngSeed: number
} {
  const previewRoom = joinGameRoom(
    createGameRoom({
      roomId: `preview-${day}`,
      hostPlayerId: 'preview-host',
      hostPlayerName: 'Preview Host',
      hostSessionId: 'preview-host',
      gameMode: 'multiplayer',
      targetPlayerCount: defaultBalanceConfig.maxPlayers,
      hostFactionId: 'sun-guild',
      seed: day,
    }),
    {
      playerId: 'preview-guest',
      playerName: 'Preview Guest',
      sessionId: 'preview-guest',
      factionId: 'market-tide',
    },
  )

  return {
    weather: previewRoom.weather ?? 'sunny',
    marketBasePrices: previewRoom.marketBasePrices ?? emptyInventory(),
    customerRoster: previewRoom.customerRoster,
    rngSeed: previewRoom.rng.seed,
  }
}

export function createDefaultRoomGameHooks(): RoomGameHooks {
  return {
    createDay(day) {
      return createPreviewDay(day)
    },
    getUpgradeCost(upgradeId) {
      return getUpgradeCost(defaultBalanceConfig, upgradeId)
    },
    startSimulation(room, simulationStartAt) {
      let gameRoom = toGameRoom(room)

      for (const player of room.players) {
        if (player.dailyPlan !== null) {
          gameRoom = updatePlayerPlan(gameRoom, player.id, player.dailyPlan)
        }
        gameRoom = setPlayerReady(gameRoom, player.id, player.hasSubmittedPlan)
      }

      const simulated = startSimulationWithTelemetry(gameRoom)
      const nextRoom = toServerRoom(simulated.room)

      return {
        room: {
          ...nextRoom,
          runLengthDays: room.runLengthDays,
          isGameComplete: false,
          finalOutcome: null,
          phase: 'simulating',
          simulation:
            nextRoom.simulation === null
              ? null
              : {
                  ...nextRoom.simulation,
                  simulationStartAt,
                },
          requestedNextDayPlayerIds: [],
        },
        telemetry: simulated.telemetry,
      }
    },
    startNextDay(room) {
      const gameRoom = toGameRoom({
        ...room,
        phase: 'results',
      })
      const nextDay = beginNextDay(enterResultsPhase(gameRoom))

      return {
        ...toServerRoom(nextDay),
        runLengthDays: room.runLengthDays,
        isGameComplete: false,
        finalOutcome: null,
        phase: 'planning',
        pausedFromPhase: null,
        requestedNextDayPlayerIds: [],
      }
    },
    createPlayerDefaults() {
      return {
        money: defaultBalanceConfig.startingMoney,
        inventory: emptyInventory(),
        reputation: defaultBalanceConfig.startingReputation,
        ownedUpgrades: defaultOwnedUpgrades(),
      }
    },
  }
}

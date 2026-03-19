import type {
  DailyPlan,
  FactionSelection,
  GameMode,
  MarketBasePrices,
  PlayerState,
  RoomPhase,
  RoomState,
  RunUpgradeId,
  Weather,
} from './contracts'
import type { SimulationTelemetry } from '../src/game/types'

export interface RoomGameHooks {
  createDay: (day: number) => {
    weather: Weather
    marketBasePrices: MarketBasePrices
    customerRoster: NonNullable<RoomState['customerRoster']>
    rngSeed: number
  }
  getUpgradeCost: (upgradeId: RunUpgradeId) => number
  startSimulation: (
    room: RoomState,
    simulationStartAt: number,
  ) => {
    room: RoomState
    telemetry: SimulationTelemetry
  }
  startNextDay: (room: RoomState) => RoomState
  createPlayerDefaults: () => Pick<PlayerState, 'money' | 'inventory' | 'reputation' | 'ownedUpgrades'>
}

interface CreateRoomInput {
  roomId: string
  playerId: string
  name: string
  gameMode: GameMode
  targetPlayerCount: number
  faction: FactionSelection
  analyticsPlayerId: string
}

interface JoinRoomInput {
  roomId: string
  playerId?: string
  name: string
  faction: FactionSelection
  analyticsPlayerId: string
}

interface SubmitPlanInput {
  roomId: string
  playerId: string
  plan: DailyPlan
}

interface RequestNextDayInput {
  roomId: string
  playerId: string
}

interface PurchaseUpgradeInput {
  roomId: string
  playerId: string
  upgradeId: RunUpgradeId
}

interface DisconnectInput {
  roomId: string
  playerId: string
}

export interface RoomMutationResult {
  room: RoomState
  simulationStartedAt: number | null
  telemetry: SimulationTelemetry | null
}

function activePhase(room: RoomState): Exclude<RoomPhase, 'paused'> {
  return room.phase === 'paused' ? room.pausedFromPhase ?? 'planning' : room.phase
}

function allPlayersConnected(room: RoomState): boolean {
  return room.players.every((player) => player.connectionStatus === 'connected')
}

function readyPlayers(room: RoomState): number {
  return room.players.filter((player) => player.hasSubmittedPlan).length
}

function requiredPlayerCount(room: Pick<RoomState, 'targetPlayerCount'>): number {
  return Math.max(1, room.targetPlayerCount)
}

function reconnectExistingPlayer(
  room: RoomState,
  playerId: string,
  input: Pick<JoinRoomInput, 'name' | 'faction'>,
): RoomState {
  const reconnected: RoomState = {
    ...room,
    players: room.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            name: input.name,
            faction: input.faction,
            connectionStatus: 'connected' as const,
          }
        : player,
    ),
  }

  return reconnected.phase === 'paused' && allPlayersConnected(reconnected)
    ? {
        ...reconnected,
        phase: reconnected.pausedFromPhase ?? 'planning',
        pausedFromPhase: null,
      }
    : reconnected
}

function planningPhase(room: RoomState): RoomState {
  if (room.players.length < requiredPlayerCount(room)) {
    return {
      ...room,
      phase: 'lobby',
    }
  }

  if (room.phase === 'paused') {
    return room
  }

  return {
    ...room,
    phase: 'planning',
  }
}

export class RoomManager {
  private readonly rooms = new Map<string, RoomState>()
  private readonly analyticsPlayerIds = new Map<string, string>()
  private readonly hooks: RoomGameHooks
  private readonly getNow: () => number

  constructor(hooks: RoomGameHooks, getNow: () => number = () => Date.now()) {
    this.hooks = hooks
    this.getNow = getNow
  }

  getRoom(roomId: string): RoomState | null {
    return this.rooms.get(roomId) ?? null
  }

  createRoom(input: CreateRoomInput): RoomState {
    const { weather, marketBasePrices, customerRoster, rngSeed } = this.hooks.createDay(1)
    const defaults = this.hooks.createPlayerDefaults()
    const room: RoomState = {
      roomId: input.roomId,
      hostPlayerId: input.playerId,
      gameMode: input.gameMode,
      targetPlayerCount: Math.max(1, input.targetPlayerCount),
      day: 1,
      weather,
      phase: input.targetPlayerCount === 1 ? 'planning' : 'lobby',
      players: [
        {
          id: input.playerId,
          name: input.name,
          faction: input.faction,
          dailyPlan: null,
          dailyResults: null,
          history: [],
          hasSubmittedPlan: false,
          connectionStatus: 'connected',
          ...defaults,
        },
      ],
      marketBasePrices,
      simulation: null,
      pausedFromPhase: null,
      requestedNextDayPlayerIds: [],
      customerRoster,
      rngSeed,
    }

    this.rooms.set(room.roomId, room)
    this.analyticsPlayerIds.set(this.analyticsKey(room.roomId, input.playerId), input.analyticsPlayerId)
    return room
  }

  joinRoom(input: JoinRoomInput): RoomState {
    const room = this.requireRoom(input.roomId)
    const existingPlayer =
      input.playerId === undefined
        ? null
        : room.players.find((player) => player.id === input.playerId) ?? null

    const matchingDisconnectedPlayer =
      input.playerId === undefined
        ? room.players.find(
            (player) =>
              player.connectionStatus === 'disconnected' &&
              player.name === input.name &&
              player.faction.id === input.faction.id,
          ) ?? null
        : null

    if (existingPlayer !== null) {
      if (existingPlayer.connectionStatus === 'connected') {
        throw new Error('That player is already connected.')
      }

      const resumed = reconnectExistingPlayer(room, existingPlayer.id, input)

      this.rooms.set(input.roomId, resumed)
      this.analyticsPlayerIds.set(this.analyticsKey(input.roomId, existingPlayer.id), input.analyticsPlayerId)
      return resumed
    }

    if (matchingDisconnectedPlayer !== null) {
      const resumed = reconnectExistingPlayer(room, matchingDisconnectedPlayer.id, input)
      this.rooms.set(input.roomId, resumed)
      this.analyticsPlayerIds.set(this.analyticsKey(input.roomId, matchingDisconnectedPlayer.id), input.analyticsPlayerId)
      return resumed
    }

    if (room.players.length >= requiredPlayerCount(room)) {
      throw new Error('That room is already full.')
    }

    const defaults = this.hooks.createPlayerDefaults()
    const joinedRoom = planningPhase({
      ...room,
      players: [
        ...room.players,
        {
          id: this.generateJoinPlayerId(room),
          name: input.name,
          faction: input.faction,
          dailyPlan: null,
          dailyResults: null,
          history: [],
          hasSubmittedPlan: false,
          connectionStatus: 'connected',
          ...defaults,
        },
      ],
    })

    this.rooms.set(input.roomId, joinedRoom)
    this.analyticsPlayerIds.set(
      this.analyticsKey(input.roomId, joinedRoom.players[joinedRoom.players.length - 1]!.id),
      input.analyticsPlayerId,
    )
    return joinedRoom
  }

  submitPlan(input: SubmitPlanInput): RoomMutationResult {
    const room = this.requireRoom(input.roomId)

    if (activePhase(room) !== 'planning') {
      throw new Error('Plans can only be submitted during planning.')
    }

    const updatedRoom: RoomState = {
      ...room,
      phase: room.phase === 'paused' ? 'paused' : 'planning',
      requestedNextDayPlayerIds: [],
      players: room.players.map((player) =>
        player.id === input.playerId
          ? {
              ...player,
              dailyPlan: input.plan,
              hasSubmittedPlan: true,
            }
          : player,
      ),
    }

    if (
      readyPlayers(updatedRoom) < requiredPlayerCount(updatedRoom) ||
      updatedRoom.players.length < requiredPlayerCount(updatedRoom) ||
      updatedRoom.phase === 'paused'
    ) {
      this.rooms.set(updatedRoom.roomId, updatedRoom)
      return {
        room: updatedRoom,
        simulationStartedAt: null,
        telemetry: null,
      }
    }

    const simulationStartedAt = this.getNow() + 1_000
    const simulatedRoom = this.hooks.startSimulation(updatedRoom, simulationStartedAt)

    this.rooms.set(simulatedRoom.room.roomId, simulatedRoom.room)
    return {
      room: simulatedRoom.room,
      simulationStartedAt,
      telemetry: simulatedRoom.telemetry,
    }
  }

  requestNextDay(input: RequestNextDayInput): RoomState {
    const room = this.requireRoom(input.roomId)

    if (activePhase(room) !== 'results') {
      throw new Error('The next day can only be requested from results.')
    }

    const requestedNextDayPlayerIds = room.requestedNextDayPlayerIds.includes(input.playerId)
      ? room.requestedNextDayPlayerIds
      : [...room.requestedNextDayPlayerIds, input.playerId]

    if (requestedNextDayPlayerIds.length < requiredPlayerCount(room)) {
      const updatedRoom = {
        ...room,
        requestedNextDayPlayerIds,
      }
      this.rooms.set(updatedRoom.roomId, updatedRoom)
      return updatedRoom
    }

    const nextDayRoom = this.hooks.startNextDay({
      ...room,
      requestedNextDayPlayerIds,
    })
    this.rooms.set(nextDayRoom.roomId, nextDayRoom)
    return nextDayRoom
  }

  purchaseUpgrade(input: PurchaseUpgradeInput): RoomState {
    const room = this.requireRoom(input.roomId)

    if (activePhase(room) !== 'planning') {
      throw new Error('Upgrades can only be purchased during planning.')
    }

    const player = room.players.find((candidate) => candidate.id === input.playerId)

    if (player === undefined) {
      throw new Error('The selected player could not be found.')
    }

    if (input.upgradeId !== 'recipe-feedback-hints') {
      throw new Error('Unknown upgrade.')
    }

    const ownsUpgrade = player.ownedUpgrades?.recipeFeedbackHints ?? false
    if (ownsUpgrade) {
      throw new Error('That upgrade is already owned.')
    }

    const cost = this.hooks.getUpgradeCost(input.upgradeId)
    if (player.money < cost) {
      throw new Error('That player cannot afford the upgrade.')
    }

    const updatedRoom: RoomState = {
      ...room,
      players: room.players.map((candidate) =>
        candidate.id === input.playerId
          ? {
              ...candidate,
              money: candidate.money - cost,
              ownedUpgrades: {
                ...(candidate.ownedUpgrades ?? { recipeFeedbackHints: false }),
                recipeFeedbackHints: true,
              },
            }
          : candidate,
      ),
    }

    this.rooms.set(updatedRoom.roomId, updatedRoom)
    return updatedRoom
  }

  completeSimulation(roomId: string): RoomState {
    const room = this.requireRoom(roomId)

    if (room.phase !== 'simulating') {
      return room
    }

    const resultsRoom: RoomState = {
      ...room,
      phase: 'results',
    }

    this.rooms.set(resultsRoom.roomId, resultsRoom)
    return resultsRoom
  }

  disconnect(input: DisconnectInput): RoomState {
    const room = this.requireRoom(input.roomId)

    const disconnectedRoom = {
      ...room,
      phase: 'paused' as const,
      pausedFromPhase: activePhase(room),
      players: room.players.map((player) =>
        player.id === input.playerId
          ? {
              ...player,
              connectionStatus: 'disconnected' as const,
            }
          : player,
      ),
    }

    this.rooms.set(disconnectedRoom.roomId, disconnectedRoom)
    return disconnectedRoom
  }

  getAnalyticsPlayerId(roomId: string, playerId: string): string | null {
    return this.analyticsPlayerIds.get(this.analyticsKey(roomId, playerId)) ?? null
  }

  private requireRoom(roomId: string): RoomState {
    const room = this.rooms.get(roomId)

    if (room === undefined) {
      throw new Error('Room not found.')
    }

    return room
  }

  private analyticsKey(roomId: string, playerId: string): string {
    return `${roomId}:${playerId}`
  }

  private generateJoinPlayerId(room: RoomState): string {
    const nextIndex = room.players.length + 1
    return `${room.roomId.toLowerCase()}-player-${nextIndex}`
  }
}

import type { CustomerProfile } from '../src/game/types'

export type RoomPhase = 'lobby' | 'planning' | 'simulating' | 'results' | 'paused'
export type GameMode = 'singleplayer' | 'multiplayer'

export type ConnectionStatus = 'connected' | 'disconnected'

export type Weather = 'sunny' | 'hot' | 'cloudy' | 'raining'

export interface FactionSelection {
  id: string
  name: string
  accentColor: string
}

export interface Inventory {
  lemons: number
  sugar: number
  ice: number
}

export interface Recipe {
  lemons: number
  sugar: number
  ice: number
}

export interface DailyPlan {
  purchases: Inventory
  recipe: Recipe
  price: number
}

export interface DailyResults {
  cupsSold: number
  revenue: number
  satisfaction: number
  reputationDelta: number
  customersWon: number
  customersSkipped: number
  customersSoldOut: number
}

export interface PlayerDayHistoryEntry {
  day: number
  revenue: number
  purchaseCost: number
  profit: number
  endingMoney: number
  reputationAfter: number
  cupsSold: number
  satisfaction: number
  recipeSnapshot: Recipe
}

export interface MarketBasePrices {
  lemons: number
  sugar: number
  ice: number
}

export type CustomerOutcome = 'buy' | 'skip' | 'soldOut'

export interface CustomerStop {
  playerId: string
  arriveAt: number
  departAt: number
}

export interface CustomerEvent {
  id: string
  customerId: string
  customerIndex: number
  spawnAt: number
  outcomeAt: number
  exitAt: number
  standStops: CustomerStop[]
  willingnessToPay: number
  targetPlayerId: string | null
  outcome: CustomerOutcome
  salePrice: number
  satisfaction: number
  lane: number
  xJitter: number
  yJitter: number
}

export interface RoomSimulation {
  customerEvents: CustomerEvent[]
  simulationStartAt: number | null
  durationMs: number
}

export interface PlayerState {
  id: string
  name: string
  faction: FactionSelection
  money: number
  inventory: Inventory
  reputation: number
  dailyPlan: DailyPlan | null
  dailyResults: DailyResults | null
  history: PlayerDayHistoryEntry[]
  hasSubmittedPlan: boolean
  connectionStatus: ConnectionStatus
}

export interface RoomState {
  roomId: string
  hostPlayerId: string
  gameMode: GameMode
  targetPlayerCount: number
  day: number
  weather: Weather
  phase: RoomPhase
  players: PlayerState[]
  marketBasePrices: MarketBasePrices
  simulation: RoomSimulation | null
  pausedFromPhase: Exclude<RoomPhase, 'paused'> | null
  requestedNextDayPlayerIds: string[]
  customerRoster?: CustomerProfile[]
  rngSeed?: number
}

export interface CreateRoomMessage {
  type: 'create_room'
  name: string
  gameMode: GameMode
  targetPlayerCount: number
  faction: FactionSelection
  analyticsPlayerId: string
}

export interface JoinRoomMessage {
  type: 'join_room'
  roomId: string
  name: string
  faction: FactionSelection
  analyticsPlayerId: string
  playerId?: string
}

export interface SubmitPlanMessage {
  type: 'submit_plan'
  roomId: string
  playerId: string
  plan: DailyPlan
}

export interface RequestNextDayMessage {
  type: 'request_next_day'
  roomId: string
  playerId: string
}

export type ClientMessage =
  | CreateRoomMessage
  | JoinRoomMessage
  | SubmitPlanMessage
  | RequestNextDayMessage

export interface ConnectedMessage {
  type: 'connected'
  roomId: string
  playerId: string
  hostPlayerId: string
}

export interface RoomStateMessage {
  type: 'room_state'
  room: RoomState
}

export interface SimulationStartedMessage {
  type: 'simulation_started'
  room: RoomState
  simulationStartAt: number
}

export interface ServerErrorMessage {
  type: 'server_error'
  message: string
}

export type ServerMessage =
  | ConnectedMessage
  | RoomStateMessage
  | SimulationStartedMessage
  | ServerErrorMessage

export interface PlayerSession {
  roomId: string
  playerId: string
}

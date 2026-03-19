export type RoomPhase = 'lobby' | 'planning' | 'simulating' | 'results' | 'paused'
export type GameMode = 'singleplayer' | 'multiplayer'
export type RunLengthDays = 14 | 30

export type Weather = 'sunny' | 'hot' | 'cloudy' | 'raining'

export type CustomerOutcome = 'buy' | 'skip' | 'soldOut'

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

export interface PlayerPlan {
  purchases: Inventory
  recipe: Recipe
  price: number
}

export interface PlayerResults {
  cupsSold: number
  revenue: number
  satisfaction: number
  reputationDelta: number
  customersWon: number
  customersSkipped: number
  customersSoldOut: number
}

export interface FactionDefinition {
  id: string
  name: string
  accentColor: string
}

export interface PlayerState {
  id: string
  name: string
  faction: FactionDefinition
  money: number
  inventory: Inventory
  reputation: number
  hasSubmittedPlan: boolean
  connectionStatus: 'connected' | 'disconnected'
  dailyPlan: PlayerPlan | null
  dailyResults: PlayerResults | null
}

export interface CustomerEvent {
  id: string
  arrivalOffsetMs: number
  willingnessToPay: number
  chosenPlayerId: string | null
  outcome: CustomerOutcome
  salePrice: number
  satisfaction: number
}

export interface RoomSimulation {
  customerEvents: CustomerEvent[]
  durationMs: number
  simulationStartAt: number
}

export interface RoomFinalOutcome {
  winnerPlayerIds: string[]
  decidedBy: 'money' | 'reputation' | 'draw'
}

export interface RoomState {
  roomId: string
  hostPlayerId: string
  gameMode: GameMode
  targetPlayerCount: number
  day: number
  runLengthDays: RunLengthDays
  isGameComplete: boolean
  finalOutcome: RoomFinalOutcome | null
  weather: Weather | null
  phase: RoomPhase
  pausedFromPhase: Exclude<RoomPhase, 'paused'> | null
  players: PlayerState[]
  marketBasePrices: Inventory | null
  simulation: RoomSimulation | null
  requestedNextDayPlayerIds: string[]
}

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

export interface CreateRoomMessage {
  type: 'create_room'
  name: string
  gameMode: GameMode
  targetPlayerCount: number
  runLengthDays: RunLengthDays
  faction: FactionDefinition
  analyticsPlayerId: string
}

export interface JoinRoomMessage {
  type: 'join_room'
  roomId: string
  name: string
  faction: FactionDefinition
  analyticsPlayerId: string
  playerId?: string
}

export interface SubmitPlanMessage {
  type: 'submit_plan'
  roomId: string
  playerId: string
  plan: PlayerPlan
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

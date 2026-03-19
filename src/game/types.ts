export type RoomPhase = 'lobby' | 'planning' | 'simulating' | 'results' | 'paused'

export type Weather = 'sunny' | 'hot' | 'cloudy' | 'raining'

export type ConnectionStatus = 'connected' | 'disconnected'

export type CustomerOutcome = 'buy' | 'skip' | 'soldOut'
export type CustomerOutcomeReason = 'purchased' | 'all_prices_above_willingness' | 'selected_stand_sold_out'
export type CustomerOfferResult = 'selected' | 'not_selected' | 'price_rejected' | 'selected_but_sold_out'

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

export interface PlayerDailyResults {
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
  accent: string
  banner: string
}

export interface PlayerState {
  id: string
  name: string
  faction: FactionDefinition
  sessionId: string | null
  money: number
  inventory: Inventory
  reputation: number
  isReady: boolean
  connectionStatus: ConnectionStatus
  dailyPlan: DailyPlan
  dailyResults: PlayerDailyResults
}

export interface CustomerEvent {
  id: string
  customerId: string
  customerIndex: number
  spawnAt: number
  resolveAt: number
  targetPlayerId: string | null
  outcome: CustomerOutcome
  salePrice: number
  satisfaction: number
  willingnessToPay: number
  lane: number
  xJitter: number
  yJitter: number
}

export interface RoomSimulation {
  events: CustomerEvent[]
  durationMs: number
  totalCustomers: number
}

export interface CustomerTasteOffsets {
  lemons: number
  sugar: number
  ice: number
}

export interface CustomerStandHistory {
  purchases: number
  lastDaySeen: number
  rollingAverageSatisfaction: number
}

export interface CustomerProfile {
  id: string
  tasteOffsets: CustomerTasteOffsets
  standHistory: Record<string, CustomerStandHistory>
}

export interface TelemetryCustomerProfile {
  customerId: string
  tasteOffsets: CustomerTasteOffsets
}

export interface TelemetryCustomerEvent {
  customerEventId: string
  customerId: string
  willingnessToPay: number
  preferredRecipe: Recipe
  chosenPlayerId: string | null
  outcome: CustomerOutcome
  salePrice: number
  satisfaction: number
  outcomeReason: CustomerOutcomeReason
}

export interface TelemetryCustomerOfferScore {
  customerEventId: string
  customerId: string
  playerId: string
  offeredPrice: number
  reputation: number
  preferredRecipeFit: number
  priceScore: number
  historyBonus: number
  totalScore: number
  canFulfill: boolean
  offerResult: CustomerOfferResult
}

export interface SimulationTelemetry {
  customerProfiles: TelemetryCustomerProfile[]
  customerEvents: TelemetryCustomerEvent[]
  customerOfferScores: TelemetryCustomerOfferScore[]
}

export interface RngState {
  seed: number
}

export interface RoomState {
  version: 2
  roomId: string
  hostPlayerId: string
  day: number
  weather: Weather | null
  phase: RoomPhase
  pausedPhase: Exclude<RoomPhase, 'paused'> | null
  players: PlayerState[]
  marketBasePrices: Inventory | null
  simulation: RoomSimulation | null
  customerRoster: CustomerProfile[]
  maxPlayers: number
  rng: RngState
}

export interface WeatherProfile {
  label: string
  customerCount: number
  idealRecipe: Recipe
  baseWillingnessToPay: number
  willingnessVariance: number
}

export interface IngredientPriceBand {
  min: number
  max: number
}

export interface BalanceConfig {
  startingMoney: number
  startingReputation: number
  defaultRecipe: Recipe
  defaultPrice: number
  weatherProfiles: Record<Weather, WeatherProfile>
  marketPriceBands: Record<keyof Inventory, IngredientPriceBand>
  maxPlayers: number
  factions: FactionDefinition[]
  reputationMin: number
  reputationMax: number
  simulationDurationMs: number
}

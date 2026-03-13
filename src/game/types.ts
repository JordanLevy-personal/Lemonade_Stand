export type GamePhase = 'morning' | 'day' | 'evening' | 'night' | 'gameOver'

export type Weather = 'sunny' | 'hot' | 'cloudy' | 'raining'

export type CardId =
  | 'lossLeader'
  | 'freeSamples'
  | 'prCampaign'
  | 'brandPremium'
  | 'merchandising'
  | 'franchiseFee'
  | 'punchCards'
  | 'theRegulars'
  | 'trendChasers'
  | 'organicSourcing'
  | 'highFructoseCornSyrup'

export type CardCategory = 'investment' | 'harvest' | 'loyalty' | 'recipe'

export type CardEffectType = 'permanent' | 'temporary' | 'instant'

export type CardAvailability = 'unique' | 'repeatable'

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

export interface DailyMarket {
  lemons: number
  sugar: number
  ice: number
}

export interface DailyPlan {
  purchases: Inventory
  recipe: Recipe
  price: number
}

export interface DailyReport {
  day: number
  weather: Weather
  pricePerCup: number
  ingredientCostPerCup: number
  potentialCustomers: number
  cupsSold: number
  freeSales: number
  regularSales: number
  premiumSales: number
  turnedAway: number
  revenue: number
  averageSatisfaction: number
  ratedSales: number
  reputationChange: number
  rentTriggered: boolean
  rentPaid: number
  spoilage: Inventory
  notes: string[]
  moneyAfterRent: number
  startingReputation: number
}

export interface ActiveCard {
  id: CardId
  draftedOnDay: number
  remainingDays?: number
}

export interface RngState {
  seed: number
}

export interface PendingReport extends DailyReport {
  flatReputationAdjustment: number
}

export interface GameState {
  version: 1
  phase: GamePhase
  day: number
  money: number
  rent: number
  rentTimer: number
  reputation: number
  inventory: Inventory
  activeCards: ActiveCard[]
  weather: Weather | null
  market: DailyMarket | null
  plan: DailyPlan
  previousRecipe: Recipe | null
  draftOptions: CardId[]
  pendingReport: PendingReport | null
  lastReport: DailyReport | null
  history: DailyReport[]
  rng: RngState
}

export interface WeatherProfile {
  label: string
  baseDemand: number
  toleranceBonus: number
  idealRecipe: Recipe
}

export interface IngredientPriceBand {
  min: number
  max: number
}

export interface BalanceConfig {
  startingMoney: number
  startingRent: number
  rentInterval: number
  rentGrowthMultiplier: number
  startingReputation: number
  reputationMin: number
  reputationMax: number
  defaultRecipe: Recipe
  defaultPrice: number
  weatherProfiles: Record<Weather, WeatherProfile>
  marketPriceBands: Record<keyof Inventory, IngredientPriceBand>
  cardCosts: Record<CardId, number>
}

export interface DraftContext {
  state: GameState
}

export interface MorningContext {
  state: GameState
  market: DailyMarket
}

export interface DemandContext {
  state: GameState
  demand: number
}

export interface PriceToleranceContext {
  state: GameState
  customerIndex: number
  recipeFit: number
  ingredientCost: number
  basePriceTolerance: number
  priceTolerance: number
}

export interface BeforeCustomerContext {
  state: GameState
  customerIndex: number
  ingredientCost: number
  basePriceTolerance: number
  priceTolerance: number
  salePrice: number
  forcePurchase: boolean
  saleIsFree: boolean
  maxSatisfaction: boolean
  ignoreSatisfaction: boolean
  regularSale: boolean
}

export interface AfterSaleContext {
  state: GameState
  customerIndex: number
  salePrice: number
  ingredientCost: number
  basePriceTolerance: number
  priceTolerance: number
  saleIsFree: boolean
  premiumSale: boolean
  reputationAdjustment: number
  moneyAdjustment: number
}

export interface SatisfactionContext {
  state: GameState
  customerIndex: number
  salePrice: number
  ingredientCost: number
  recipeFit: number
  saleIsFree: boolean
  satisfaction: number
}

export interface EveningContext {
  state: GameState
  report: PendingReport
  satisfactionReputationDelta: number
  reputationAdjustment: number
  moneyAdjustment: number
}

export interface ReputationClampContext {
  state: GameState
  minimum: number
  maximum: number
}

export interface CardHooks {
  onDraft?: (context: DraftContext) => GameState
  onMorning?: (context: MorningContext) => MorningContext
  modifyDemand?: (context: DemandContext) => DemandContext
  modifyPriceTolerance?: (context: PriceToleranceContext) => PriceToleranceContext
  beforeCustomer?: (context: BeforeCustomerContext) => BeforeCustomerContext
  afterSale?: (context: AfterSaleContext) => AfterSaleContext
  modifySatisfaction?: (context: SatisfactionContext) => SatisfactionContext
  onEvening?: (context: EveningContext) => EveningContext
  onReputationClamp?: (context: ReputationClampContext) => ReputationClampContext
}

export interface CardDefinition {
  id: CardId
  name: string
  description: string
  category: CardCategory
  cost: number
  effectType: CardEffectType
  availability: CardAvailability
  durationDays?: number
  hooks: CardHooks
}

export interface SaveGameV1 {
  version: 1
  state: GameState
}

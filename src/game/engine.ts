import { defaultBalanceConfig } from './balance'
import { allCards, getCardDefinition } from './cards'
import { nextFloat, nextInt, normalizeSeed } from './rng'
import type {
  ActiveCard,
  BalanceConfig,
  CardDefinition,
  CardId,
  CustomerVisit,
  DailyMarket,
  DailyPlan,
  DailyReport,
  EveningContext,
  GameState,
  Inventory,
  PendingReport,
  Recipe,
  SaveGameV1,
  Weather,
} from './types'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function roundReputation(value: number): number {
  return Math.round(value)
}

function emptyInventory(): Inventory {
  return {
    lemons: 0,
    sugar: 0,
    ice: 0,
  }
}

function cloneInventory(inventory: Inventory): Inventory {
  return {
    lemons: inventory.lemons,
    sugar: inventory.sugar,
    ice: inventory.ice,
  }
}

function addInventory(left: Inventory, right: Inventory): Inventory {
  return {
    lemons: left.lemons + right.lemons,
    sugar: left.sugar + right.sugar,
    ice: left.ice + right.ice,
  }
}

function subtractInventory(left: Inventory, right: Inventory): Inventory {
  return {
    lemons: left.lemons - right.lemons,
    sugar: left.sugar - right.sugar,
    ice: left.ice - right.ice,
  }
}

function canServeCup(inventory: Inventory, recipe: Recipe): boolean {
  return (
    inventory.lemons >= recipe.lemons &&
    inventory.sugar >= recipe.sugar &&
    inventory.ice >= recipe.ice
  )
}

function activeDefinitions(state: GameState): CardDefinition[] {
  return state.activeCards.map((card) => getCardDefinition(card.id))
}

function isPermanent(card: CardDefinition): boolean {
  return card.effectType === 'permanent'
}

function rollPrice(
  minimum: number,
  maximum: number,
  state: GameState,
): [number, GameState] {
  const [value, rng] = nextFloat(state.rng)
  return [roundMoney(minimum + value * (maximum - minimum)), { ...state, rng }]
}

function rollWeather(state: GameState): [Weather, GameState] {
  const weatherOrder: Weather[] = ['sunny', 'hot', 'cloudy', 'raining']
  const [index, rng] = nextInt(state.rng, weatherOrder.length)
  return [weatherOrder[index], { ...state, rng }]
}

function rollMarket(state: GameState, balance: BalanceConfig): [DailyMarket, GameState] {
  let nextState = state
  const market = {} as DailyMarket

  ;(['lemons', 'sugar', 'ice'] as const).forEach((ingredient) => {
    const band = balance.marketPriceBands[ingredient]
    const [price, rolledState] = rollPrice(band.min, band.max, nextState)
    market[ingredient] = price
    nextState = rolledState
  })

  return [market, nextState]
}

function ingredientCostForRecipe(recipe: Recipe, market: DailyMarket): number {
  return roundMoney(
    recipe.lemons * market.lemons + recipe.sugar * market.sugar + recipe.ice * market.ice,
  )
}

function calculateRecipeFit(
  recipe: Recipe,
  weather: Weather,
  balance: BalanceConfig,
): number {
  const ideal = balance.weatherProfiles[weather].idealRecipe
  const perIngredient = [
    1 - Math.abs(recipe.lemons - ideal.lemons) / 5,
    1 - Math.abs(recipe.sugar - ideal.sugar) / 5,
    1 - Math.abs(recipe.ice - ideal.ice) / 5,
  ]

  return clamp(
    perIngredient.reduce((sum, part) => sum + part, 0) / perIngredient.length,
    0,
    1,
  )
}

function calculateBaseDemand(
  weather: Weather,
  reputation: number,
  balance: BalanceConfig,
): number {
  const profile = balance.weatherProfiles[weather]
  return Math.max(0, profile.baseDemand + Math.round((reputation - 50) / 6))
}

function calculateBaseTolerance(
  ingredientCost: number,
  reputation: number,
  recipeFit: number,
  weather: Weather,
  balance: BalanceConfig,
): number {
  const profile = balance.weatherProfiles[weather]
  const multiplier = 1.05 + reputation / 150 + recipeFit * 0.45 + profile.toleranceBonus
  return Math.max(0.25, roundMoney(ingredientCost * multiplier))
}

function calculateBuyChance(
  recipeFit: number,
  reputation: number,
  price: number,
  priceTolerance: number,
): number {
  const priceGap = clamp((priceTolerance - price) / Math.max(priceTolerance, 0.25), -1, 1)
  return clamp(0.12 + recipeFit * 0.45 + reputation / 220 + priceGap * 0.28, 0.03, 0.98)
}

function calculateSatisfaction(
  recipeFit: number,
  price: number,
  ingredientCost: number,
  reputation: number,
): number {
  const fairPrice = Math.max(0.25, ingredientCost * (1.1 + recipeFit * 0.25 + reputation / 280))
  const priceFairness =
    price === 0
      ? 1
      : clamp(1 - Math.max(0, price - fairPrice) / Math.max(fairPrice, 0.25), 0, 1)

  return clamp(recipeFit * 0.72 + priceFairness * 0.28, 0, 1)
}

function calculateReputationDelta(report: DailyReport): number {
  if (report.ratedSales === 0) {
    return 0
  }

  const volumeWeight = Math.max(4, Math.round(report.ratedSales * 0.8))
  return roundReputation((report.averageSatisfaction - 0.55) * volumeWeight)
}

function buildArrivalProgresses(
  count: number,
  rngState: GameState['rng'],
): [number[], GameState['rng']] {
  if (count === 0) {
    return [[], rngState]
  }

  let rng = rngState
  let cumulative = 0
  const arrivals: number[] = []

  for (let index = 0; index < count; index += 1) {
    const [roll, nextRng] = nextFloat(rng)
    rng = nextRng
    const safeRoll = Math.max(roll, Number.EPSILON)
    const gap = -Math.log(1 - safeRoll)

    cumulative += gap
    arrivals.push(cumulative)
  }

  const firstArrival = arrivals[0]
  const lastArrival = arrivals[arrivals.length - 1]
  const playbackStart = 0.06
  const playbackEnd = 0.78

  if (lastArrival === firstArrival) {
    return [[playbackStart], rng]
  }

  const normalized = arrivals.map((arrival) => {
    const progress = (arrival - firstArrival) / (lastArrival - firstArrival)
    return Number((playbackStart + progress * (playbackEnd - playbackStart)).toFixed(4))
  })

  return [normalized, rng]
}

function clampReputation(state: GameState, balance: BalanceConfig, reputation: number): number {
  let minimum = balance.reputationMin
  let maximum = balance.reputationMax

  for (const definition of activeDefinitions(state)) {
    if (definition.hooks.onReputationClamp) {
      const result = definition.hooks.onReputationClamp({
        state,
        minimum,
        maximum,
      })
      minimum = result.minimum
      maximum = result.maximum
    }
  }

  return clamp(roundReputation(reputation), minimum, maximum)
}

function applyMorningEffects(state: GameState, market: DailyMarket): DailyMarket {
  let nextMarket = market

  for (const definition of activeDefinitions(state)) {
    if (definition.hooks.onMorning) {
      nextMarket = definition.hooks.onMorning({
        state: {
          ...state,
          market: nextMarket,
        },
        market: nextMarket,
      }).market
    }
  }

  return {
    lemons: roundMoney(nextMarket.lemons),
    sugar: roundMoney(nextMarket.sugar),
    ice: roundMoney(nextMarket.ice),
  }
}

export function refreshMorningMarket(state: GameState): GameState {
  if (state.market === null) {
    return state
  }

  return {
    ...state,
    market: applyMorningEffects(state, state.market),
  }
}

function updatePlan(state: GameState, updates: Partial<DailyPlan>): GameState {
  return {
    ...state,
    plan: {
      ...state.plan,
      ...updates,
    },
  }
}

function cardAlreadyOwned(state: GameState, card: CardDefinition): boolean {
  if (!isPermanent(card)) {
    return false
  }

  return state.activeCards.some((activeCard) => activeCard.id === card.id)
}

function temporaryCardStillActive(state: GameState, card: CardDefinition): boolean {
  if (card.effectType !== 'temporary') {
    return false
  }

  return state.activeCards.some((activeCard) => activeCard.id === card.id)
}

function availableCards(state: GameState): CardDefinition[] {
  return allCards.filter((card) => {
    if (cardAlreadyOwned(state, card)) {
      return false
    }

    if (temporaryCardStillActive(state, card)) {
      return false
    }

    return true
  })
}

function pickDistinctCards(
  state: GameState,
  cards: CardDefinition[],
  count: number,
): [CardId[], GameState] {
  const pool = [...cards]
  let nextState = state
  const picked: CardId[] = []

  while (picked.length < count && pool.length > 0) {
    const [index, rng] = nextInt(nextState.rng, pool.length)
    nextState = {
      ...nextState,
      rng,
    }
    const [selected] = pool.splice(index, 1)
    picked.push(selected.id)
  }

  return [picked, nextState]
}

function decrementTemporaryCards(cards: ActiveCard[]): ActiveCard[] {
  return cards
    .map((card) => {
      if (card.remainingDays === undefined) {
        return card
      }

      return {
        ...card,
        remainingDays: card.remainingDays - 1,
      }
    })
    .filter((card) => card.remainingDays === undefined || card.remainingDays > 0)
}

function applyActiveCard(state: GameState, card: CardDefinition): GameState {
  if (card.effectType === 'instant') {
    return state
  }

  if (card.effectType === 'temporary' && card.durationDays !== undefined) {
    return {
      ...state,
      activeCards: [
        ...state.activeCards,
        {
          id: card.id,
          draftedOnDay: state.day,
          remainingDays: card.durationDays,
        },
      ],
    }
  }

  return {
    ...state,
    activeCards: [
      ...state.activeCards,
      {
        id: card.id,
        draftedOnDay: state.day,
      },
    ],
  }
}

export function startDay(state: GameState, balance: BalanceConfig = defaultBalanceConfig): GameState {
  if (state.phase === 'gameOver') {
    return state
  }

  const [weather, weatherState] = rollWeather(state)
  const [baseMarket, marketState] = rollMarket(weatherState, balance)
  const market = applyMorningEffects(
    {
      ...marketState,
      weather,
    },
    baseMarket,
  )

  return {
    ...marketState,
    phase: 'morning',
    weather,
    market,
    draftOptions: [],
    pendingReport: null,
    plan: {
      purchases: emptyInventory(),
      recipe: state.plan.recipe,
      price: state.plan.price,
    },
  }
}

export function createNewGame(
  options: {
    seed?: number
    balance?: BalanceConfig
  } = {},
): GameState {
  const balance = options.balance ?? defaultBalanceConfig
  const baseState: GameState = {
    version: 1,
    phase: 'morning',
    day: 1,
    money: balance.startingMoney,
    rent: balance.startingRent,
    rentTimer: balance.rentInterval,
    reputation: balance.startingReputation,
    inventory: emptyInventory(),
    activeCards: [],
    weather: null,
    market: null,
    plan: {
      purchases: emptyInventory(),
      recipe: balance.defaultRecipe,
      price: balance.defaultPrice,
    },
    previousRecipe: null,
    draftOptions: [],
    pendingReport: null,
    lastReport: null,
    history: [],
    rng: {
      seed: normalizeSeed(options.seed ?? Date.now()),
    },
  }

  return startDay(baseState, balance)
}

export function buyIngredients(state: GameState, purchases: Inventory): GameState {
  if (state.phase !== 'morning' || state.market === null) {
    return state
  }

  const purchaseCost = roundMoney(
    purchases.lemons * state.market.lemons +
      purchases.sugar * state.market.sugar +
      purchases.ice * state.market.ice,
  )

  if (purchaseCost > state.money) {
    throw new Error('Not enough money for those ingredients.')
  }

  return updatePlan(
    {
      ...state,
      inventory: addInventory(state.inventory, purchases),
      money: roundMoney(state.money - purchaseCost),
    },
    {
      purchases: addInventory(state.plan.purchases, purchases),
    },
  )
}

export function setStrategy(
  state: GameState,
  strategy: {
    recipe: Recipe
    price: number
  },
): GameState {
  const recipe = {
    lemons: clamp(Math.round(strategy.recipe.lemons), 0, 5),
    sugar: clamp(Math.round(strategy.recipe.sugar), 0, 5),
    ice: clamp(Math.round(strategy.recipe.ice), 0, 5),
  }

  const price = roundMoney(Math.max(0, strategy.price))

  return updatePlan(state, {
    recipe,
    price,
  })
}

export function resolveDay(
  state: GameState,
  balance: BalanceConfig = defaultBalanceConfig,
): GameState {
  if (state.phase !== 'morning' || state.weather === null || state.market === null) {
    return state
  }

  let money = state.money
  let inventory = cloneInventory(state.inventory)
  const reputation = state.reputation
  let rng = state.rng

  const ingredientCost = ingredientCostForRecipe(state.plan.recipe, state.market)
  const recipeFit = calculateRecipeFit(state.plan.recipe, state.weather, balance)

  let demand = calculateBaseDemand(state.weather, reputation, balance)
  for (const definition of activeDefinitions(state)) {
    if (definition.hooks.modifyDemand) {
      demand = Math.max(
        0,
        Math.round(
          definition.hooks.modifyDemand({
            state,
            demand,
          }).demand,
        ),
      )
    }
  }

  const notes: string[] = []
  let cupsSold = 0
  let freeSales = 0
  let regularSales = 0
  let premiumSales = 0
  let turnedAway = 0
  let revenue = 0
  let satisfactionTotal = 0
  let ratedSales = 0
  let flatReputationAdjustment = 0
  const [arrivalProgresses, nextRng] = buildArrivalProgresses(demand, rng)
  rng = nextRng
  const customerVisits: CustomerVisit[] = []

  for (let customerIndex = 0; customerIndex < demand; customerIndex += 1) {
    const stateForCustomer: GameState = {
      ...state,
      money,
      inventory,
      reputation,
      rng,
    }

    const basePriceTolerance = calculateBaseTolerance(
      ingredientCost,
      reputation,
      recipeFit,
      state.weather,
      balance,
    )

    let priceTolerance = basePriceTolerance
    for (const definition of activeDefinitions(stateForCustomer)) {
      if (definition.hooks.modifyPriceTolerance) {
        priceTolerance = definition.hooks.modifyPriceTolerance({
          state: stateForCustomer,
          customerIndex,
          recipeFit,
          ingredientCost,
          basePriceTolerance,
          priceTolerance,
        }).priceTolerance
      }
    }

    let customerContext = {
      state: stateForCustomer,
      customerIndex,
      ingredientCost,
      basePriceTolerance,
      priceTolerance,
      salePrice: state.plan.price,
      forcePurchase: false,
      saleIsFree: false,
      maxSatisfaction: false,
      ignoreSatisfaction: false,
      regularSale: false,
    }

    for (const definition of activeDefinitions(stateForCustomer)) {
      if (definition.hooks.beforeCustomer) {
        customerContext = definition.hooks.beforeCustomer(customerContext)
      }
    }

    const salePrice = customerContext.saleIsFree ? 0 : customerContext.salePrice
    const buyChance = customerContext.forcePurchase
      ? 1
      : calculateBuyChance(recipeFit, reputation, salePrice, customerContext.priceTolerance)
    const [roll, nextRng] = nextFloat(rng)
    rng = nextRng
    const wantsToBuy = customerContext.forcePurchase || roll < buyChance

    if (!wantsToBuy) {
      customerVisits.push({
        customerIndex,
        arrivalProgress: arrivalProgresses[customerIndex],
        outcome: 'skip',
        indicator: 'x',
      })
      continue
    }

    if (!canServeCup(inventory, state.plan.recipe)) {
      turnedAway += 1
      customerVisits.push({
        customerIndex,
        arrivalProgress: arrivalProgresses[customerIndex],
        outcome: 'soldOut',
        indicator: 'x',
      })
      continue
    }

    inventory = subtractInventory(inventory, state.plan.recipe)
    money = roundMoney(money + salePrice)
    revenue = roundMoney(revenue + salePrice)
    cupsSold += 1

    if (customerContext.saleIsFree) {
      freeSales += 1
    }

    if (customerContext.regularSale) {
      regularSales += 1
    }

    let satisfaction = customerContext.maxSatisfaction
      ? 1
      : calculateSatisfaction(recipeFit, salePrice, ingredientCost, reputation)

    for (const definition of activeDefinitions(stateForCustomer)) {
      if (definition.hooks.modifySatisfaction) {
        satisfaction = definition.hooks.modifySatisfaction({
          state: {
            ...stateForCustomer,
            money,
            inventory,
            reputation,
            rng,
          },
          customerIndex,
          salePrice,
          ingredientCost,
          recipeFit,
          saleIsFree: customerContext.saleIsFree,
          satisfaction,
        }).satisfaction
      }
    }

    if (!customerContext.ignoreSatisfaction) {
      satisfactionTotal += satisfaction
      ratedSales += 1
    }

    let afterSaleContext = {
      state: {
        ...stateForCustomer,
        money,
        inventory,
        reputation,
        rng,
      },
      customerIndex,
      salePrice,
      ingredientCost,
      basePriceTolerance,
      priceTolerance: customerContext.priceTolerance,
      saleIsFree: customerContext.saleIsFree,
      premiumSale: false,
      reputationAdjustment: 0,
      moneyAdjustment: 0,
    }

    for (const definition of activeDefinitions(stateForCustomer)) {
      if (definition.hooks.afterSale) {
        afterSaleContext = definition.hooks.afterSale(afterSaleContext)
      }
    }

    if (afterSaleContext.premiumSale) {
      premiumSales += 1
    }

    money = roundMoney(money + afterSaleContext.moneyAdjustment)
    flatReputationAdjustment += afterSaleContext.reputationAdjustment
    customerVisits.push({
      customerIndex,
      arrivalProgress: arrivalProgresses[customerIndex],
      outcome: 'buy',
      indicator: 'check',
    })
  }

  const averageSatisfaction = ratedSales === 0 ? 0 : satisfactionTotal / ratedSales
  const pendingReport: PendingReport = {
    day: state.day,
    weather: state.weather,
    pricePerCup: state.plan.price,
    ingredientCostPerCup: ingredientCost,
    potentialCustomers: demand,
    cupsSold,
    freeSales,
    regularSales,
    premiumSales,
    turnedAway,
    revenue,
    averageSatisfaction,
    ratedSales,
    reputationChange: 0,
    rentTriggered: false,
    rentPaid: 0,
    spoilage: emptyInventory(),
    notes,
    moneyAfterRent: money,
    startingReputation: state.reputation,
    flatReputationAdjustment,
    customerVisits,
  }

  return {
    ...state,
    phase: 'day',
    money,
    inventory,
    reputation,
    rng,
    pendingReport,
  }
}

export function applyEvening(
  state: GameState,
  balance: BalanceConfig = defaultBalanceConfig,
): GameState {
  if (state.phase !== 'day' || state.pendingReport === null) {
    return state
  }

  const spoilage = {
    lemons: 0,
    sugar: 0,
    ice: state.inventory.ice,
  }
  const inventory = {
    ...state.inventory,
    ice: 0,
  }

  let report: PendingReport = {
    ...state.pendingReport,
    spoilage,
  }

  let eveningContext: EveningContext = {
    state: {
      ...state,
      inventory,
      pendingReport: report,
    },
    report,
    satisfactionReputationDelta: calculateReputationDelta(report),
    reputationAdjustment: 0,
    moneyAdjustment: 0,
  }

  for (const definition of activeDefinitions(state)) {
    if (definition.hooks.onEvening) {
      eveningContext = definition.hooks.onEvening(eveningContext)
    }
  }

  let money = roundMoney(state.money + eveningContext.moneyAdjustment)
  const reputation = clampReputation(
    state,
    balance,
    state.reputation +
      report.flatReputationAdjustment +
      eveningContext.satisfactionReputationDelta +
      eveningContext.reputationAdjustment,
  )
  let rent = state.rent
  let rentTimer = state.rentTimer - 1
  let phase: GameState['phase'] = 'evening'

  report = {
    ...eveningContext.report,
  }

  if (rentTimer <= 0) {
    money = roundMoney(money - rent)
    report = {
      ...report,
      rentTriggered: true,
      rentPaid: rent,
    }
    rent = Math.ceil(rent * balance.rentGrowthMultiplier)
    rentTimer = balance.rentInterval
  }

  if (money < 0) {
    phase = 'gameOver'
  }

  const { flatReputationAdjustment, customerVisits, ...finalizedReport } = report
  void flatReputationAdjustment
  void customerVisits

  const settledReport: DailyReport = {
    ...finalizedReport,
    reputationChange: reputation - report.startingReputation,
    moneyAfterRent: money,
    notes: [...report.notes],
  }

  return {
    ...state,
    phase,
    money,
    rent,
    rentTimer,
    reputation,
    inventory,
    previousRecipe: state.plan.recipe,
    activeCards: decrementTemporaryCards(state.activeCards),
    pendingReport: null,
    lastReport: settledReport,
    history: [...state.history, settledReport],
  }
}

export function generateDraft(state: GameState): GameState {
  if (state.phase === 'gameOver') {
    return state
  }

  const [draftOptions, nextState] = pickDistinctCards(
    {
      ...state,
      phase: 'night',
    },
    availableCards(state),
    3,
  )

  return {
    ...nextState,
    phase: 'night',
    draftOptions,
  }
}

export function pickCard(
  state: GameState,
  cardId: CardId,
  balance: BalanceConfig = defaultBalanceConfig,
): GameState {
  if (state.phase !== 'night' || !state.draftOptions.includes(cardId)) {
    return state
  }

  const definition = getCardDefinition(cardId)

  if (definition.cost > state.money) {
    return state
  }

  let nextState: GameState = {
    ...state,
    money: roundMoney(state.money - definition.cost),
    draftOptions: [],
  }

  if (definition.hooks.onDraft) {
    nextState = definition.hooks.onDraft({
      state: nextState,
    })
  }

  nextState = applyActiveCard(nextState, definition)

  return startDay(
    {
      ...nextState,
      day: state.day + 1,
    },
    balance,
  )
}

export function skipDraft(
  state: GameState,
  balance: BalanceConfig = defaultBalanceConfig,
): GameState {
  if (state.phase !== 'night') {
    return state
  }

  return startDay(
    {
      ...state,
      draftOptions: [],
      day: state.day + 1,
    },
    balance,
  )
}

export function saveGame(state: GameState): SaveGameV1 {
  return {
    version: 1,
    state,
  }
}

export function loadGame(save: unknown): GameState | null {
  if (
    typeof save === 'object' &&
    save !== null &&
    'version' in save &&
    'state' in save &&
    (save as SaveGameV1).version === 1
  ) {
    return (save as SaveGameV1).state
  }

  return null
}

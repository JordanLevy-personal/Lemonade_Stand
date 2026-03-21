import { defaultBalanceConfig } from './balance'
import { nextFloat, nextInt, normalizeSeed } from './rng'
import { defaultOwnedUpgrades } from './upgrades'
import type {
  BalanceConfig,
  CustomerOfferResult,
  CustomerOutcome,
  CustomerOutcomeReason,
  CustomerEvent,
  CustomerStop,
  CustomerProfile,
  CustomerStandHistory,
  DailyPlan,
  FactionDefinition,
  Inventory,
  PlayerDailyResults,
  PlayerState,
  Recipe,
  RecipeFeedbackHint,
  RoomState,
  SimulationTelemetry,
  TelemetryCustomerEvent,
  TelemetryCustomerOfferScore,
  Weather,
} from './types'

const MIN_PRIMARY_RECIPE_INGREDIENT = 0.1
const RECIPE_PRECISION = 1
const INVENTORY_EPSILON = 1e-9
const SATISFACTION_CURVE_EXPONENT = 2
const PRICE_SCORE_EXPONENT = 6.4
const REPUTATION_BREAKEVEN_SATISFACTION = 0.50
const REPUTATION_SCALING_FACTOR = 5
const REPUTATION_WTP_MAX_MODIFIER = 0.15
const CUSTOMER_ENTRY_TRAVEL_MS = 1_080
const CUSTOMER_STAND_DWELL_MS = 1_000
const CUSTOMER_BETWEEN_STANDS_MS = 840
const CUSTOMER_EXIT_TRAVEL_MS = 1_080
const CUSTOMER_SPAWN_BUFFER_MS = 300
const RECIPE_HINT_INGREDIENT_ORDER = ['lemons', 'sugar', 'ice'] as const
const CUSTOMER_END_BUFFER_MS = 300

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function roundToPrecision(value: number, precision: number): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

export function emptyInventory(): Inventory {
  return {
    lemons: 0,
    sugar: 0,
    ice: 0,
  }
}

function emptyResults(): PlayerDailyResults {
  return {
    cupsSold: 0,
    revenue: 0,
    satisfaction: 0,
    reputationDelta: 0,
    customersWon: 0,
    customersSkipped: 0,
    customersSoldOut: 0,
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
    lemons: roundToPrecision(left.lemons + right.lemons, RECIPE_PRECISION),
    sugar: roundToPrecision(left.sugar + right.sugar, RECIPE_PRECISION),
    ice: roundToPrecision(left.ice + right.ice, RECIPE_PRECISION),
  }
}

function subtractInventory(left: Inventory, recipe: Recipe): Inventory {
  return {
    lemons: roundToPrecision(Math.max(0, left.lemons - recipe.lemons), RECIPE_PRECISION),
    sugar: roundToPrecision(Math.max(0, left.sugar - recipe.sugar), RECIPE_PRECISION),
    ice: roundToPrecision(Math.max(0, left.ice - recipe.ice), RECIPE_PRECISION),
  }
}

export function sanitizeRecipe(recipe: Recipe): Recipe {
  return {
    lemons: clamp(
      roundToPrecision(recipe.lemons, RECIPE_PRECISION),
      MIN_PRIMARY_RECIPE_INGREDIENT,
      5,
    ),
    sugar: clamp(
      roundToPrecision(recipe.sugar, RECIPE_PRECISION),
      MIN_PRIMARY_RECIPE_INGREDIENT,
      5,
    ),
    ice: clamp(roundToPrecision(recipe.ice, RECIPE_PRECISION), 0, 5),
  }
}

export function calculateRecipeFeedbackHint(
  offeredRecipe: Recipe,
  preferredRecipe: Recipe,
): RecipeFeedbackHint | null {
  let strongestIngredient: keyof Recipe | null = null
  let strongestDelta = 0

  for (const ingredient of RECIPE_HINT_INGREDIENT_ORDER) {
    const delta = preferredRecipe[ingredient] - offeredRecipe[ingredient]
    const absoluteDelta = Math.abs(delta)

    if (absoluteDelta > strongestDelta) {
      strongestIngredient = ingredient
      strongestDelta = absoluteDelta
    }
  }

  if (strongestIngredient === null || strongestDelta === 0) {
    return null
  }

  const delta = preferredRecipe[strongestIngredient] - offeredRecipe[strongestIngredient]

  return {
    ingredient: strongestIngredient,
    direction: delta > 0 ? 'more' : 'less',
  }
}

function recipeFeedbackHintsForPlayers(
  players: RoomState['players'],
  preferredRecipe: Recipe,
): Record<string, RecipeFeedbackHint> {
  return players.reduce<Record<string, RecipeFeedbackHint>>((accumulator, player) => {
    if (player.ownedUpgrades?.recipeFeedbackHints !== true) {
      return accumulator
    }

    const hint = calculateRecipeFeedbackHint(player.dailyPlan.recipe, preferredRecipe)

    if (hint !== null) {
      accumulator[player.id] = hint
    }

    return accumulator
  }, {})
}

function createDailyPlan(balance: BalanceConfig, current?: Partial<DailyPlan>): DailyPlan {
  return {
    purchases: current?.purchases ? cloneInventory(current.purchases) : emptyInventory(),
    recipe: current?.recipe ? sanitizeRecipe(current.recipe) : balance.defaultRecipe,
    price:
      current?.price === undefined
        ? balance.defaultPrice
        : roundMoney(Math.max(0, current.price)),
  }
}

function findFaction(
  balance: BalanceConfig,
  factionId: string | undefined,
  fallbackIndex: number,
): FactionDefinition {
  return (
    balance.factions.find((faction) => faction.id === factionId) ??
    balance.factions[fallbackIndex] ??
    balance.factions[0]
  )
}

function createPlayer(
  input: {
    id: string
    name: string
    sessionId: string
    factionId?: string
  },
  balance: BalanceConfig,
  fallbackIndex: number,
): PlayerState {
  return {
    id: input.id,
    name: input.name,
    faction: findFaction(balance, input.factionId, fallbackIndex),
    sessionId: input.sessionId,
    money: balance.startingMoney,
    inventory: emptyInventory(),
    reputation: balance.startingReputation,
    ownedUpgrades: defaultOwnedUpgrades(),
    isReady: false,
    connectionStatus: 'connected',
    dailyPlan: createDailyPlan(balance),
    dailyResults: emptyResults(),
    history: [],
  }
}

function weatherOrder(): Weather[] {
  return ['sunny', 'hot', 'cloudy', 'raining']
}

function maximumCustomerCount(balance: BalanceConfig): number {
  return Math.max(...Object.values(balance.weatherProfiles).map((profile) => profile.customerCount))
}

function rollTasteOffset(room: RoomState): [number, RoomState] {
  const [offsetIndex, rng] = nextInt(room.rng, 5)
  return [offsetIndex - 2, { ...room, rng }]
}

function createCustomerRoster(
  room: RoomState,
  balance: BalanceConfig,
): [CustomerProfile[], RoomState] {
  const rosterSize = maximumCustomerCount(balance)
  const roster: CustomerProfile[] = []
  let nextRoom = room

  for (let customerIndex = 0; customerIndex < rosterSize; customerIndex += 1) {
    const [lemons, lemonsRoom] = rollTasteOffset(nextRoom)
    const [sugar, sugarRoom] = rollTasteOffset(lemonsRoom)
    const [ice, iceRoom] = rollTasteOffset(sugarRoom)

    roster.push({
      id: `customer-${customerIndex}`,
      tasteOffsets: { lemons, sugar, ice },
      standHistory: {},
    })
    nextRoom = iceRoom
  }

  return [roster, nextRoom]
}

function randomJitter(seed: number, amplitude: number): number {
  return Number((Math.sin(seed * 12.9898) * amplitude).toFixed(3))
}

function rollWeather(room: RoomState): [Weather, RoomState] {
  const [index, rng] = nextInt(room.rng, weatherOrder().length)
  return [weatherOrder()[index], { ...room, rng }]
}

function rollPrice(minimum: number, maximum: number, room: RoomState): [number, RoomState] {
  const [value, rng] = nextFloat(room.rng)
  return [roundMoney(minimum + value * (maximum - minimum)), { ...room, rng }]
}

function rollMarket(room: RoomState, balance: BalanceConfig): [Inventory, RoomState] {
  let nextRoom = room
  const market = {} as Inventory

  ;(['lemons', 'sugar', 'ice'] as const).forEach((ingredient) => {
    const [price, rolledRoom] = rollPrice(
      balance.marketPriceBands[ingredient].min,
      balance.marketPriceBands[ingredient].max,
      nextRoom,
    )
    market[ingredient] = price
    nextRoom = rolledRoom
  })

  return [market, nextRoom]
}

function resetPlayersForPlanning(players: PlayerState[], balance: BalanceConfig): PlayerState[] {
  return players.map((player) => ({
    ...player,
    isReady: false,
    dailyPlan: createDailyPlan(balance, {
      recipe: player.dailyPlan.recipe,
      price: player.dailyPlan.price,
    }),
    dailyResults: emptyResults(),
  }))
}

function preparePlanningDay(
  room: RoomState,
  day: number,
  balance: BalanceConfig,
): RoomState {
  const [weather, weatherRoom] = rollWeather(room)
  const [marketBasePrices, marketRoom] = rollMarket(weatherRoom, balance)

  return {
    ...marketRoom,
    day,
    weather,
    phase: 'planning',
    pausedPhase: null,
    marketBasePrices,
    simulation: null,
    players: resetPlayersForPlanning(room.players, balance),
  }
}

export function createRoom(
  input: {
    roomId: string
    hostPlayerId: string
    hostPlayerName: string
    hostSessionId: string
    gameMode: RoomState['gameMode']
    targetPlayerCount: number
    hostFactionId?: string
    seed?: number
  },
  balance: BalanceConfig = defaultBalanceConfig,
): RoomState {
  const targetPlayerCount = Math.max(1, input.targetPlayerCount)
  const baseRoom: RoomState = {
    version: 2,
    roomId: input.roomId,
    hostPlayerId: input.hostPlayerId,
    gameMode: input.gameMode,
    day: 1,
    weather: null,
    phase: 'lobby',
    pausedPhase: null,
    players: [
      createPlayer(
        {
          id: input.hostPlayerId,
          name: input.hostPlayerName,
          sessionId: input.hostSessionId,
          factionId: input.hostFactionId,
        },
        balance,
        0,
      ),
    ],
    marketBasePrices: null,
    simulation: null,
    customerRoster: [],
    maxPlayers: targetPlayerCount,
    rng: {
      seed: normalizeSeed(input.seed ?? Date.now()),
    },
  }

  const [customerRoster, roomWithRosterRng] = createCustomerRoster(baseRoom, balance)
  const initializedRoom: RoomState = {
    ...roomWithRosterRng,
    customerRoster,
  }

  return targetPlayerCount === 1
    ? preparePlanningDay(initializedRoom, initializedRoom.day, balance)
    : initializedRoom
}

export function joinRoom(
  room: RoomState,
  input: {
    playerId: string
    playerName: string
    sessionId: string
    factionId?: string
  },
  balance: BalanceConfig = defaultBalanceConfig,
): RoomState {
  if (room.players.some((player) => player.id === input.playerId)) {
    return reconnectPlayer(room, input.playerId, input.sessionId)
  }

  if (room.players.length >= room.maxPlayers) {
    throw new Error('Room is full.')
  }

  const nextRoom: RoomState = {
    ...room,
    players: [
      ...room.players,
      createPlayer(
        {
          id: input.playerId,
          name: input.playerName,
          sessionId: input.sessionId,
          factionId: input.factionId,
        },
        balance,
        room.players.length,
      ),
    ],
  }

  return nextRoom.players.length === nextRoom.maxPlayers
    ? preparePlanningDay(nextRoom, room.day, balance)
    : nextRoom
}

export function reconnectPlayer(room: RoomState, playerId: string, sessionId: string): RoomState {
  const nextPlayers = room.players.map((player) =>
    player.id === playerId
      ? {
          ...player,
          sessionId,
          connectionStatus: 'connected' as const,
        }
      : player,
  )
  const everyoneConnected = nextPlayers.every((player) => player.connectionStatus === 'connected')
  const shouldResume = room.phase === 'paused' && everyoneConnected && room.pausedPhase !== null

  return {
    ...room,
    players: nextPlayers,
    phase: shouldResume ? room.pausedPhase ?? 'planning' : room.phase,
    pausedPhase: shouldResume ? null : room.pausedPhase,
  }
}

export function disconnectPlayer(room: RoomState, playerId: string): RoomState {
  return {
    ...room,
    phase: 'paused',
    pausedPhase: room.phase === 'paused' ? room.pausedPhase : room.phase,
    players: room.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            connectionStatus: 'disconnected',
          }
        : player,
    ),
  }
}

export function calculateSellableCups(inventory: Inventory, recipe: Recipe): number {
  const capacities = (['lemons', 'sugar', 'ice'] as const)
    .filter((ingredient) => recipe[ingredient] > 0)
    .map((ingredient) =>
      Math.floor((inventory[ingredient] + INVENTORY_EPSILON) / recipe[ingredient]),
    )

  if (capacities.length === 0) {
    return Number.POSITIVE_INFINITY
  }

  return Math.max(0, Math.min(...capacities))
}

export function calculatePerIngredientCapacity(
  inventory: Inventory,
  recipe: Recipe,
): Inventory {
  function _capacityFor(ingredient: keyof Inventory): number {
    if (recipe[ingredient] <= 0) {
      return Number.POSITIVE_INFINITY
    }
    return Math.floor((inventory[ingredient] + INVENTORY_EPSILON) / recipe[ingredient])
  }

  return {
    lemons: _capacityFor('lemons'),
    sugar: _capacityFor('sugar'),
    ice: _capacityFor('ice'),
  }
}

export function calculatePurchaseCost(market: Inventory, purchases: Inventory): number {
  return roundMoney(
    purchases.lemons * market.lemons +
      purchases.sugar * market.sugar +
      purchases.ice * market.ice,
  )
}

export function customerCountForWeather(
  weather: Weather,
  playerCount: number = defaultBalanceConfig.maxPlayers,
  balance: BalanceConfig = defaultBalanceConfig,
): number {
  const baseCount = balance.weatherProfiles[weather].customerCount
  return Math.max(1, Math.round((baseCount * Math.max(1, playerCount)) / defaultBalanceConfig.maxPlayers))
}

export function calculateRecipeFit(
  recipe: Recipe,
  weather: Weather,
  balance: BalanceConfig = defaultBalanceConfig,
): number {
  const idealRecipe = balance.weatherProfiles[weather].idealRecipe
  const ingredientFit = [
    1 - Math.abs(recipe.lemons - idealRecipe.lemons) / 5,
    1 - Math.abs(recipe.sugar - idealRecipe.sugar) / 5,
    1 - Math.abs(recipe.ice - idealRecipe.ice) / 5,
  ]

  return clamp(
    ingredientFit.reduce((sum, value) => sum + value, 0) / ingredientFit.length,
    0,
    1,
  )
}

function preferredRecipeForCustomer(
  customer: CustomerProfile,
  weather: Weather,
  balance: BalanceConfig,
): Recipe {
  const idealRecipe = balance.weatherProfiles[weather].idealRecipe
  const tasteWeight = balance.customerTastePreferenceWeight

  return sanitizeRecipe({
    lemons: idealRecipe.lemons + customer.tasteOffsets.lemons * tasteWeight,
    sugar: idealRecipe.sugar + customer.tasteOffsets.sugar * tasteWeight,
    ice: idealRecipe.ice + customer.tasteOffsets.ice * tasteWeight,
  })
}

function calculatePreferredRecipeFit(recipe: Recipe, preferredRecipe: Recipe): number {
  const ingredientFit = [
    1 - Math.abs(recipe.lemons - preferredRecipe.lemons) / 5,
    1 - Math.abs(recipe.sugar - preferredRecipe.sugar) / 5,
    1 - Math.abs(recipe.ice - preferredRecipe.ice) / 5,
  ]

  return clamp(
    ingredientFit.reduce((sum, value) => sum + value, 0) / ingredientFit.length,
    0,
    1,
  )
}

function historyBonus(history: CustomerStandHistory | undefined, currentDay: number): number {
  if (history === undefined) {
    return 0
  }

  const recencyGap = Math.max(0, currentDay - history.lastDaySeen)
  const recencyMultiplier = clamp(1 - recencyGap * 0.25, 0, 1)
  const purchasePull = clamp(history.purchases / 3, 0, 1)
  const satisfactionPull = clamp(history.rollingAverageSatisfaction, 0, 1)

  return Number((recencyMultiplier * (purchasePull * 0.08 + satisfactionPull * 0.16)).toFixed(4))
}

function shuffleCustomerRoster(
  room: RoomState,
  customerRoster: CustomerProfile[],
): [CustomerProfile[], RoomState] {
  const shuffledRoster = [...customerRoster]
  let nextRoom = room

  for (let index = shuffledRoster.length - 1; index > 0; index -= 1) {
    const [swapIndex, rng] = nextInt(nextRoom.rng, index + 1)
    ;[shuffledRoster[index], shuffledRoster[swapIndex]] = [shuffledRoster[swapIndex], shuffledRoster[index]]
    nextRoom = {
      ...nextRoom,
      rng,
    }
  }

  return [shuffledRoster, nextRoom]
}

function sampleCustomersForDay(
  room: RoomState,
  weather: Weather,
  balance: BalanceConfig,
): [CustomerProfile[], RoomState] {
  const [shuffledRoster, shuffledRoom] = shuffleCustomerRoster(room, room.customerRoster)
  return [shuffledRoster.slice(0, customerCountForWeather(weather, room.maxPlayers, balance)), shuffledRoom]
}

function priceScore(price: number, willingnessToPay: number): number {
  if (price >= willingnessToPay) {
    return 0
  }

  const ratio = price / Math.max(willingnessToPay, 0.25)
  return clamp(1 - ratio ** PRICE_SCORE_EXPONENT, 0, 1)
}

function curveScore(score: number): number {
  return clamp(score, 0, 1) ** SATISFACTION_CURVE_EXPONENT
}

export function _calculateReputationDelta(avgSatisfaction: number, cupsSold: number): number {
  if (cupsSold === 0) {
    return -1
  }
  const volumeScale = Math.max(2, Math.round(cupsSold / 4))
  return Math.round((avgSatisfaction - REPUTATION_BREAKEVEN_SATISFACTION) * volumeScale * REPUTATION_SCALING_FACTOR)
}

export function _effectiveWtp(baseWtp: number, reputation: number): number {
  const modifier = clamp(REPUTATION_WTP_MAX_MODIFIER * (reputation - 50) / 50, -REPUTATION_WTP_MAX_MODIFIER, REPUTATION_WTP_MAX_MODIFIER)
  return baseWtp * (1 + modifier)
}

export function calculateStandScore(
  input: {
    willingnessToPay: number
    recipe: Recipe
    price: number
    reputation: number
  },
  weather: Weather,
  balance: BalanceConfig = defaultBalanceConfig,
): number {
  const priced = priceScore(input.price, input.willingnessToPay)
  if (priced === 0) {
    return 0
  }

  const recipeFit = calculateRecipeFit(input.recipe, weather, balance)
  const reputationPull = clamp(input.reputation / 100, 0, 1)

  return Number((priced * 0.45 + recipeFit * 0.30 + reputationPull * 0.25).toFixed(4))
}

export function updatePlayerPlan(
  room: RoomState,
  playerId: string,
  updates: Partial<DailyPlan>,
  balance: BalanceConfig = defaultBalanceConfig,
): RoomState {
  if (room.phase !== 'planning') {
    return room
  }

  return {
    ...room,
    players: room.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            isReady: false,
            dailyPlan: createDailyPlan(balance, {
              purchases: updates.purchases ?? player.dailyPlan.purchases,
              recipe: updates.recipe ?? player.dailyPlan.recipe,
              price: updates.price ?? player.dailyPlan.price,
            }),
          }
        : player,
    ),
  }
}

export function setPlayerReady(room: RoomState, playerId: string, isReady: boolean): RoomState {
  if (room.phase !== 'planning') {
    return room
  }

  return {
    ...room,
    players: room.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            isReady,
          }
        : player,
    ),
  }
}

export function roomCanStartSimulation(room: RoomState): boolean {
  return (
    room.phase === 'planning' &&
    room.weather !== null &&
    room.marketBasePrices !== null &&
    room.players.length === room.maxPlayers &&
    room.players.every((player) => player.isReady && player.connectionStatus === 'connected')
  )
}

function applyPurchases(player: PlayerState, market: Inventory): PlayerState {
  const purchaseCost = calculatePurchaseCost(market, player.dailyPlan.purchases)
  if (purchaseCost > player.money) {
    throw new Error(`${player.name} cannot afford the submitted shopping list.`)
  }

  return {
    ...player,
    inventory: addInventory(player.inventory, player.dailyPlan.purchases),
    money: roundMoney(player.money - purchaseCost),
  }
}

function generateCustomerBudget(
  room: RoomState,
  weather: Weather,
  balance: BalanceConfig,
): [number, RoomState] {
  const [roll, rng] = nextFloat(room.rng)
  const profile = balance.weatherProfiles[weather]
  return [
    roundMoney(profile.baseWillingnessToPay + roll * profile.willingnessVariance),
    {
      ...room,
      rng,
    },
  ]
}

function chooseWinner(
  scoredPlayers: TelemetryCustomerOfferScore[],
  room: RoomState,
): [string | null, RoomState] {
  const totalScore = scoredPlayers.reduce((sum, entry) => sum + entry.totalScore, 0)

  if (totalScore <= 0) {
    return [null, room]
  }

  const [roll, rng] = nextFloat(room.rng)
  const winningThreshold = roll * totalScore
  let cumulativeScore = 0

  for (const entry of scoredPlayers) {
    cumulativeScore += entry.totalScore
    if (winningThreshold < cumulativeScore) {
      return [entry.playerId, { ...room, rng }]
    }
  }

  const fallbackWinner = scoredPlayers.findLast((entry) => entry.totalScore > 0)
  return [fallbackWinner?.playerId ?? null, { ...room, rng }]
}

function scoreCustomerOffers(
  room: RoomState,
  customer: CustomerProfile,
  customerEventId: string,
  willingnessToPay: number,
  preferredRecipe: Recipe,
  selectionRound: number,
  excludedPlayerIds: Set<string> = new Set(),
): TelemetryCustomerOfferScore[] {
  return room.players
    .filter((player) => !excludedPlayerIds.has(player.id))
    .map((player) => {
      const playerEffectiveWtp = _effectiveWtp(willingnessToPay, player.reputation)
      const offerPriceScore = priceScore(player.dailyPlan.price, playerEffectiveWtp)
      const preferredRecipeFit = calculatePreferredRecipeFit(player.dailyPlan.recipe, preferredRecipe)
      const repeatHistoryBonus = historyBonus(customer.standHistory[player.id], room.day)
      const totalScore =
        offerPriceScore === 0
          ? 0
          : Number(
              (
                offerPriceScore * 0.35 +
                preferredRecipeFit * 0.35 +
                clamp(player.reputation / 100, 0, 1) * 0.15 +
                repeatHistoryBonus
              ).toFixed(4),
            )

      return {
        customerEventId,
        customerId: customer.id,
        playerId: player.id,
        offeredPrice: player.dailyPlan.price,
        reputation: player.reputation,
        preferredRecipeFit,
        priceScore: offerPriceScore,
        historyBonus: repeatHistoryBonus,
        totalScore,
        canFulfill: calculateSellableCups(player.inventory, player.dailyPlan.recipe) >= 1,
        selectionRound,
        offerResult: offerPriceScore === 0 ? 'price_rejected' : 'not_selected',
      }
    })
}

function applyOfferResults(
  scores: TelemetryCustomerOfferScore[],
  winningPlayerId: string | null,
  selectedResult: CustomerOfferResult,
): TelemetryCustomerOfferScore[] {
  return scores.map((score) =>
    score.playerId === winningPlayerId
      ? {
          ...score,
          offerResult: selectedResult,
        }
      : score,
  )
}

export function calculateSatisfactionScore(
  recipeFit: number,
  price: number,
  willingnessToPay: number,
): number {
  return Number(
    (
      curveScore(recipeFit) * 0.7 + curveScore(priceScore(price, willingnessToPay)) * 0.3
    ).toFixed(4),
  )
}

function updateCustomerHistory(
  room: RoomState,
  customerId: string,
  playerId: string,
  day: number,
  satisfaction: number | null,
): RoomState {
  return {
    ...room,
    customerRoster: room.customerRoster.map((customer) => {
      if (customer.id !== customerId) {
        return customer
      }

      const previousHistory = customer.standHistory[playerId]
      const purchases = previousHistory?.purchases ?? 0
      const nextPurchases = satisfaction === null ? purchases : purchases + 1
      const nextAverageSatisfaction =
        satisfaction === null
          ? previousHistory?.rollingAverageSatisfaction ?? 0
          : Number(
              (
                ((previousHistory?.rollingAverageSatisfaction ?? 0) * purchases + satisfaction) /
                Math.max(1, nextPurchases)
              ).toFixed(4),
            )

      return {
        ...customer,
        standHistory: {
          ...customer.standHistory,
          [playerId]: {
            purchases: nextPurchases,
            lastDaySeen: day,
            rollingAverageSatisfaction: nextAverageSatisfaction,
          },
        },
      }
    }),
  }
}

function finalizePlayers(room: RoomState, satisfactionTotals: Map<string, number>, balance: BalanceConfig): PlayerState[] {
  return room.players.map((player) => {
    const satisfaction =
      player.dailyResults.cupsSold === 0
        ? 0
        : Number(
            (
              (satisfactionTotals.get(player.id) ?? 0) / player.dailyResults.cupsSold
            ).toFixed(4),
          )
    const reputationDelta = _calculateReputationDelta(satisfaction, player.dailyResults.cupsSold)
    const reputationAfter = clamp(player.reputation + reputationDelta, balance.reputationMin, balance.reputationMax)
    const purchaseCost = calculatePurchaseCost(room.marketBasePrices ?? emptyInventory(), player.dailyPlan.purchases)
    const profit = roundMoney(player.dailyResults.revenue - purchaseCost)
    const endingMoney = roundMoney(player.money)

    return {
      ...player,
      reputation: reputationAfter,
      isReady: false,
      dailyResults: {
        ...player.dailyResults,
        satisfaction,
        reputationDelta,
      },
      history: [
        ...player.history,
        {
          day: room.day,
          revenue: player.dailyResults.revenue,
          purchaseCost,
          profit,
          endingMoney,
          reputationAfter,
          cupsSold: player.dailyResults.cupsSold,
          satisfaction,
          recipeSnapshot: sanitizeRecipe(player.dailyPlan.recipe),
        },
      ],
    }
  })
}

function customerActivityDurationMs(stopCount: number, stopDurationMs: number): number {
  if (stopCount <= 0) {
    return CUSTOMER_ENTRY_TRAVEL_MS + CUSTOMER_STAND_DWELL_MS + CUSTOMER_EXIT_TRAVEL_MS
  }

  return CUSTOMER_ENTRY_TRAVEL_MS
    + stopCount * stopDurationMs
    + Math.max(stopCount - 1, 0) * CUSTOMER_BETWEEN_STANDS_MS
    + CUSTOMER_EXIT_TRAVEL_MS
}

function spawnAtForCustomer(
  customerIndex: number,
  totalCustomers: number,
  durationMs: number,
  activityDurationMs: number,
): number {
  const normalized = totalCustomers <= 1 ? 0 : customerIndex / (totalCustomers - 1)
  const latestSpawnAt = Math.max(
    CUSTOMER_SPAWN_BUFFER_MS,
    durationMs - CUSTOMER_END_BUFFER_MS - activityDurationMs,
  )

  return Math.round(
    CUSTOMER_SPAWN_BUFFER_MS + normalized * (latestSpawnAt - CUSTOMER_SPAWN_BUFFER_MS),
  )
}

function eventTimings(
  customerIndex: number,
  spawnAt: number,
  standStops: CustomerStop[],
): { spawnAt: number; outcomeAt: number; exitAt: number; lane: number; xJitter: number; yJitter: number } {
  const lane = customerIndex % 3
  const outcomeAt = standStops.at(-1)?.departAt ?? spawnAt + CUSTOMER_ENTRY_TRAVEL_MS + CUSTOMER_STAND_DWELL_MS

  return {
    spawnAt,
    outcomeAt,
    exitAt: outcomeAt + CUSTOMER_EXIT_TRAVEL_MS,
    lane,
    xJitter: randomJitter(customerIndex + 1, 0.18),
    yJitter: randomJitter(customerIndex + 7, 0.12),
  }
}

function customerActivityDurationForStops(stops: Array<{ stopDurationMs: number }>): number {
  if (stops.length === 0) {
    return CUSTOMER_ENTRY_TRAVEL_MS + CUSTOMER_STAND_DWELL_MS + CUSTOMER_EXIT_TRAVEL_MS
  }

  return CUSTOMER_ENTRY_TRAVEL_MS
    + stops.reduce((total, stop) => total + stop.stopDurationMs, 0)
    + Math.max(stops.length - 1, 0) * CUSTOMER_BETWEEN_STANDS_MS
    + CUSTOMER_EXIT_TRAVEL_MS
}

function leftToRightPlayerIds(room: RoomState): string[] {
  return room.players.map((player) => player.id)
}

function visitedPlayerIdsForEvent(room: RoomState, winnerId: string | null, outcome: CustomerEvent['outcome']): string[] {
  const orderedPlayerIds = leftToRightPlayerIds(room)
  if (orderedPlayerIds.length <= 1) {
    return orderedPlayerIds
  }

  if (outcome !== 'buy' || winnerId === null) {
    return orderedPlayerIds
  }

  const winnerIndex = orderedPlayerIds.indexOf(winnerId)
  return winnerIndex === -1 ? orderedPlayerIds : orderedPlayerIds.slice(0, winnerIndex + 1)
}

function buildStandStops(
  visitedPlayerIds: string[],
  spawnAt: number,
  stopDurationMs: number,
): CustomerStop[] {
  let nextArrival = spawnAt + CUSTOMER_ENTRY_TRAVEL_MS

  return visitedPlayerIds.map((playerId, index) => {
    const arriveAt = nextArrival
    const departAt = arriveAt + stopDurationMs
    nextArrival = departAt + (index === visitedPlayerIds.length - 1 ? 0 : CUSTOMER_BETWEEN_STANDS_MS)

    return {
      playerId,
      arriveAt,
      departAt,
    }
  })
}

function buildStandStopsFromTimeline(
  stops: Array<{ playerId: string; stopDurationMs: number }>,
  spawnAt: number,
): CustomerStop[] {
  let nextArrival = spawnAt + CUSTOMER_ENTRY_TRAVEL_MS

  return stops.map((stop, index) => {
    const arriveAt = nextArrival
    const departAt = arriveAt + stop.stopDurationMs
    nextArrival = departAt + (index === stops.length - 1 ? 0 : CUSTOMER_BETWEEN_STANDS_MS)

    return {
      playerId: stop.playerId,
      arriveAt,
      departAt,
    }
  })
}

function applyCustomerResolution(
  room: RoomState,
  soldOutPlayerIds: string[],
  winnerId: string | null,
  salePrice: number,
): RoomState {
  const soldOutPlayerIdSet = new Set(soldOutPlayerIds)

  return {
    ...room,
    players: room.players.map((player) => {
      if (player.id === winnerId) {
        return {
          ...player,
          inventory: subtractInventory(player.inventory, player.dailyPlan.recipe),
          money: roundMoney(player.money + salePrice),
          dailyResults: {
            ...player.dailyResults,
            cupsSold: player.dailyResults.cupsSold + 1,
            revenue: roundMoney(player.dailyResults.revenue + salePrice),
            customersWon: player.dailyResults.customersWon + 1,
          },
        }
      }

      if (soldOutPlayerIdSet.has(player.id)) {
        return {
          ...player,
          dailyResults: {
            ...player.dailyResults,
            customersSoldOut: player.dailyResults.customersSoldOut + 1,
          },
        }
      }

      return {
        ...player,
        dailyResults: {
          ...player.dailyResults,
          customersSkipped: player.dailyResults.customersSkipped + 1,
        },
      }
    }),
  }
}

function buildTimedStandStops(
  customerIndex: number,
  totalCustomers: number,
  visitedPlayerIds: string[],
  stopDurationMs: number,
  durationMs: number,
): {
  standStops: CustomerStop[]
  timing: ReturnType<typeof eventTimings>
} {
  const spawnAt = spawnAtForCustomer(
    customerIndex,
    totalCustomers,
    durationMs,
    customerActivityDurationMs(visitedPlayerIds.length, stopDurationMs),
  )
  const standStops = buildStandStops(visitedPlayerIds, spawnAt, stopDurationMs)

  return {
    standStops,
    timing: eventTimings(customerIndex, spawnAt, standStops),
  }
}

function buildTimedStandStopsFromTimeline(
  customerIndex: number,
  totalCustomers: number,
  stops: Array<{ playerId: string; stopDurationMs: number }>,
  durationMs: number,
): {
  standStops: CustomerStop[]
  timing: ReturnType<typeof eventTimings>
} {
  const spawnAt = spawnAtForCustomer(
    customerIndex,
    totalCustomers,
    durationMs,
    customerActivityDurationForStops(stops),
  )
  const standStops = buildStandStopsFromTimeline(stops, spawnAt)

  return {
    standStops,
    timing: eventTimings(customerIndex, spawnAt, standStops),
  }
}

export function startSimulationWithTelemetry(
  room: RoomState,
  options: {
    durationMs?: number
  } = {},
  balance: BalanceConfig = defaultBalanceConfig,
): { room: RoomState; telemetry: SimulationTelemetry } {
  if (!roomCanStartSimulation(room) || room.weather === null || room.marketBasePrices === null) {
    return {
      room,
      telemetry: {
        customerProfiles: room.customerRoster.map((customer) => ({
          customerId: customer.id,
          tasteOffsets: customer.tasteOffsets,
        })),
        customerEvents: [],
        customerOfferScores: [],
      },
    }
  }

  const requestedDurationMs = options.durationMs ?? balance.simulationDurationMs
  let nextRoom: RoomState = {
    ...room,
    players: room.players.map((player) => applyPurchases(player, room.marketBasePrices!)),
  }

  const [customersForDay, sampledRoom] = sampleCustomersForDay(nextRoom, room.weather, balance)
  nextRoom = sampledRoom
  const totalCustomers = customersForDay.length
  const events: CustomerEvent[] = []
  const telemetryEvents: TelemetryCustomerEvent[] = []
  const telemetryScores: TelemetryCustomerOfferScore[] = []
  const satisfactionTotals = new Map<string, number>()
  let computedDurationMs = requestedDurationMs

  nextRoom.players.forEach((player) => {
    satisfactionTotals.set(player.id, 0)
  })

  for (let customerIndex = 0; customerIndex < totalCustomers; customerIndex += 1) {
    const customer = customersForDay[customerIndex]
    const customerEventId = `customer-${customerIndex}`
    const [willingnessToPay, budgetRoom] = generateCustomerBudget(nextRoom, room.weather, balance)
    nextRoom = budgetRoom
    const preferredRecipe = preferredRecipeForCustomer(customer, room.weather, balance)
    const soldOutPlayerIds: string[] = []
    const excludedPlayerIds = new Set<string>()
    let selectionRound = 1
    let winnerId: string | null = null
    let finalOutcome: CustomerOutcome = 'skip'
    let finalOutcomeReason: CustomerOutcomeReason = 'all_prices_above_willingness'
    let finalSalePrice = 0
    let finalSatisfaction = 0

    while (excludedPlayerIds.size < nextRoom.players.length) {
      const scores = scoreCustomerOffers(
        nextRoom,
        customer,
        customerEventId,
        willingnessToPay,
        preferredRecipe,
        selectionRound,
        excludedPlayerIds,
      )

      if (scores.length === 0) {
        break
      }

      const [roundWinnerId, winnerRoom] = chooseWinner(scores, nextRoom)
      nextRoom = winnerRoom

      if (roundWinnerId === null) {
        telemetryScores.push(...scores)
        break
      }

      const chosenPlayer = nextRoom.players.find((player) => player.id === roundWinnerId)
      if (chosenPlayer === undefined || calculateSellableCups(chosenPlayer.inventory, chosenPlayer.dailyPlan.recipe) < 1) {
        telemetryScores.push(...applyOfferResults(scores, roundWinnerId, 'selected_but_sold_out'))
        soldOutPlayerIds.push(roundWinnerId)
        excludedPlayerIds.add(roundWinnerId)
        selectionRound += 1
        continue
      }

      const recipeFit = calculatePreferredRecipeFit(chosenPlayer.dailyPlan.recipe, preferredRecipe)
      finalSatisfaction = calculateSatisfactionScore(
        recipeFit,
        chosenPlayer.dailyPlan.price,
        willingnessToPay,
      )
      satisfactionTotals.set(roundWinnerId, (satisfactionTotals.get(roundWinnerId) ?? 0) + finalSatisfaction)
      telemetryScores.push(...applyOfferResults(scores, roundWinnerId, 'selected'))
      winnerId = roundWinnerId
      finalOutcome = 'buy'
      finalOutcomeReason =
        soldOutPlayerIds.length > 0 ? 'purchased_after_sold_out_reroute' : 'purchased'
      finalSalePrice = chosenPlayer.dailyPlan.price
      break
    }

    if (winnerId === null && soldOutPlayerIds.length > 0) {
      finalOutcome = 'skip'
      finalOutcomeReason = 'reroute_exhausted_after_sold_out'
    }

    const feedbackHintsByPlayerId = recipeFeedbackHintsForPlayers(nextRoom.players, preferredRecipe)
    nextRoom = applyCustomerResolution(nextRoom, soldOutPlayerIds, winnerId, finalSalePrice)

    if (winnerId !== null) {
      nextRoom = updateCustomerHistory(nextRoom, customer.id, winnerId, room.day, finalSatisfaction)
    }

    const { standStops, timing } =
      winnerId !== null && soldOutPlayerIds.length === 0
        ? buildTimedStandStops(
            customerIndex,
            totalCustomers,
            visitedPlayerIdsForEvent(nextRoom, winnerId, 'buy'),
            CUSTOMER_STAND_DWELL_MS,
            requestedDurationMs,
          )
        : winnerId !== null
          ? buildTimedStandStopsFromTimeline(
              customerIndex,
              totalCustomers,
              [
                ...soldOutPlayerIds.map((playerId) => ({ playerId, stopDurationMs: 0 })),
                { playerId: winnerId, stopDurationMs: CUSTOMER_STAND_DWELL_MS },
              ],
              requestedDurationMs,
            )
          : soldOutPlayerIds.length > 0
            ? buildTimedStandStopsFromTimeline(
                customerIndex,
                totalCustomers,
                soldOutPlayerIds.map((playerId) => ({ playerId, stopDurationMs: 0 })),
                requestedDurationMs,
              )
            : buildTimedStandStops(
                customerIndex,
                totalCustomers,
                visitedPlayerIdsForEvent(nextRoom, null, 'skip'),
                CUSTOMER_STAND_DWELL_MS,
                requestedDurationMs,
              )
    computedDurationMs = Math.max(computedDurationMs, timing.exitAt)

    events.push({
      id: customerEventId,
      customerId: customer.id,
      customerIndex,
      spawnAt: timing.spawnAt,
      outcomeAt: timing.outcomeAt,
      exitAt: timing.exitAt,
      standStops,
      targetPlayerId: winnerId,
      outcome: finalOutcome,
      salePrice: finalSalePrice,
      satisfaction: finalSatisfaction,
      willingnessToPay,
      lane: timing.lane,
      xJitter: timing.xJitter,
      yJitter: timing.yJitter,
      ...(Object.keys(feedbackHintsByPlayerId).length > 0
        ? { feedbackHintsByPlayerId }
        : {}),
    })
    telemetryEvents.push({
      customerEventId,
      customerId: customer.id,
      willingnessToPay,
      preferredRecipe,
      chosenPlayerId: winnerId,
      outcome: finalOutcome,
      salePrice: finalSalePrice,
      satisfaction: finalSatisfaction,
      outcomeReason: finalOutcomeReason,
      rerouteCount: soldOutPlayerIds.length,
    })
  }

  const simulatedRoom: RoomState = {
    ...nextRoom,
    phase: 'simulating',
    pausedPhase: null,
    players: finalizePlayers(nextRoom, satisfactionTotals, balance),
    simulation: {
      events,
      durationMs: computedDurationMs,
      totalCustomers,
    },
  }

  return {
    room: simulatedRoom,
    telemetry: {
      customerProfiles: simulatedRoom.customerRoster.map((customer) => ({
        customerId: customer.id,
        tasteOffsets: customer.tasteOffsets,
      })),
      customerEvents: telemetryEvents,
      customerOfferScores: telemetryScores,
    },
  }
}

export function startSimulation(
  room: RoomState,
  options: {
    durationMs?: number
  } = {},
  balance: BalanceConfig = defaultBalanceConfig,
): RoomState {
  return startSimulationWithTelemetry(room, options, balance).room
}

export function enterResultsPhase(room: RoomState): RoomState {
  if (room.phase !== 'simulating') {
    return room
  }

  return {
    ...room,
    phase: 'results',
  }
}

export function beginNextDay(
  room: RoomState,
  balance: BalanceConfig = defaultBalanceConfig,
): RoomState {
  if (room.players.length < room.maxPlayers) {
    return {
      ...room,
      phase: 'lobby',
      pausedPhase: null,
      weather: null,
      marketBasePrices: null,
      simulation: null,
    }
  }

  const nextDay = room.phase === 'results' || room.phase === 'simulating' ? room.day + 1 : room.day
  return preparePlanningDay(room, nextDay, balance)
}

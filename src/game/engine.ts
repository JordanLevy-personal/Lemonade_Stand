import { defaultBalanceConfig } from './balance'
import { nextFloat, nextInt, normalizeSeed } from './rng'
import type {
  BalanceConfig,
  CustomerEvent,
  DailyPlan,
  FactionDefinition,
  Inventory,
  PlayerDailyResults,
  PlayerState,
  Recipe,
  RoomState,
  Weather,
} from './types'

const MIN_PRIMARY_RECIPE_INGREDIENT = 0.1
const RECIPE_PRECISION = 1
const INVENTORY_EPSILON = 1e-9
const SATISFACTION_CURVE_EXPONENT = 2

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
    isReady: false,
    connectionStatus: 'connected',
    dailyPlan: createDailyPlan(balance),
    dailyResults: emptyResults(),
  }
}

function weatherOrder(): Weather[] {
  return ['sunny', 'hot', 'cloudy', 'raining']
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
    hostFactionId?: string
    seed?: number
  },
  balance: BalanceConfig = defaultBalanceConfig,
): RoomState {
  return {
    version: 2,
    roomId: input.roomId,
    hostPlayerId: input.hostPlayerId,
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
    maxPlayers: balance.maxPlayers,
    rng: {
      seed: normalizeSeed(input.seed ?? Date.now()),
    },
  }
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

export function calculatePurchaseCost(market: Inventory, purchases: Inventory): number {
  return roundMoney(
    purchases.lemons * market.lemons +
      purchases.sugar * market.sugar +
      purchases.ice * market.ice,
  )
}

export function customerCountForWeather(
  weather: Weather,
  balance: BalanceConfig = defaultBalanceConfig,
): number {
  return balance.weatherProfiles[weather].customerCount
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

function priceScore(price: number, willingnessToPay: number): number {
  if (price > willingnessToPay) {
    return 0
  }

  return clamp(1 - price / Math.max(willingnessToPay, 0.25), 0, 1)
}

function curveScore(score: number): number {
  return clamp(score, 0, 1) ** SATISFACTION_CURVE_EXPONENT
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

  return Number((priced * 0.5 + recipeFit * 0.3 + reputationPull * 0.2).toFixed(4))
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
  room: RoomState,
  willingnessToPay: number,
  weather: Weather,
  balance: BalanceConfig,
): [string | null, RoomState] {
  const scoredPlayers = room.players.map((player) => ({
    playerId: player.id,
    score: calculateStandScore(
      {
        willingnessToPay,
        recipe: player.dailyPlan.recipe,
        price: player.dailyPlan.price,
        reputation: player.reputation,
      },
      weather,
      balance,
    ),
  }))
  const totalScore = scoredPlayers.reduce((sum, entry) => sum + entry.score, 0)

  if (totalScore <= 0) {
    return [null, room]
  }

  const [roll, rng] = nextFloat(room.rng)
  const winningThreshold = roll * totalScore
  let cumulativeScore = 0

  for (const entry of scoredPlayers) {
    cumulativeScore += entry.score
    if (winningThreshold < cumulativeScore) {
      return [entry.playerId, { ...room, rng }]
    }
  }

  const fallbackWinner = scoredPlayers.findLast((entry) => entry.score > 0)
  return [fallbackWinner?.playerId ?? null, { ...room, rng }]
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
    const reputationDelta =
      player.dailyResults.cupsSold === 0
        ? -1
        : Math.round((satisfaction - 0.55) * Math.max(2, Math.round(player.dailyResults.cupsSold / 4)) * 2)

    return {
      ...player,
      reputation: clamp(player.reputation + reputationDelta, balance.reputationMin, balance.reputationMax),
      isReady: false,
      dailyResults: {
        ...player.dailyResults,
        satisfaction,
        reputationDelta,
      },
    }
  })
}

function eventTimings(
  customerIndex: number,
  totalCustomers: number,
  durationMs: number,
): { spawnAt: number; resolveAt: number; lane: number; xJitter: number; yJitter: number } {
  const normalized = totalCustomers <= 1 ? 0.1 : customerIndex / (totalCustomers - 1)
  const spawnAt = Math.round(300 + normalized * durationMs * 0.65)
  const lane = customerIndex % 3

  return {
    spawnAt,
    resolveAt: Math.min(durationMs, spawnAt + 1_500),
    lane,
    xJitter: randomJitter(customerIndex + 1, 0.18),
    yJitter: randomJitter(customerIndex + 7, 0.12),
  }
}

export function startSimulation(
  room: RoomState,
  options: {
    durationMs?: number
  } = {},
  balance: BalanceConfig = defaultBalanceConfig,
): RoomState {
  if (!roomCanStartSimulation(room) || room.weather === null || room.marketBasePrices === null) {
    return room
  }

  const durationMs = options.durationMs ?? balance.simulationDurationMs
  let nextRoom: RoomState = {
    ...room,
    players: room.players.map((player) => applyPurchases(player, room.marketBasePrices!)),
  }

  const totalCustomers = customerCountForWeather(room.weather, balance)
  const events: CustomerEvent[] = []
  const satisfactionTotals = new Map<string, number>()

  nextRoom.players.forEach((player) => {
    satisfactionTotals.set(player.id, 0)
  })

  for (let customerIndex = 0; customerIndex < totalCustomers; customerIndex += 1) {
    const [willingnessToPay, budgetRoom] = generateCustomerBudget(nextRoom, room.weather, balance)
    nextRoom = budgetRoom
    const [winnerId, winnerRoom] = chooseWinner(nextRoom, willingnessToPay, room.weather, balance)
    nextRoom = winnerRoom
    const timing = eventTimings(customerIndex, totalCustomers, durationMs)

    if (winnerId === null) {
      nextRoom = {
        ...nextRoom,
        players: nextRoom.players.map((player) => ({
          ...player,
          dailyResults: {
            ...player.dailyResults,
            customersSkipped: player.dailyResults.customersSkipped + 1,
          },
        })),
      }
      events.push({
        id: `customer-${customerIndex}`,
        customerIndex,
        spawnAt: timing.spawnAt,
        resolveAt: timing.resolveAt,
        targetPlayerId: null,
        outcome: 'skip',
        salePrice: 0,
        satisfaction: 0,
        willingnessToPay,
        lane: timing.lane,
        xJitter: timing.xJitter,
        yJitter: timing.yJitter,
      })
      continue
    }

    const chosenPlayer = nextRoom.players.find((player) => player.id === winnerId)
    if (chosenPlayer === undefined || calculateSellableCups(chosenPlayer.inventory, chosenPlayer.dailyPlan.recipe) < 1) {
      nextRoom = {
        ...nextRoom,
        players: nextRoom.players.map((player) =>
          player.id === winnerId
            ? {
                ...player,
                dailyResults: {
                  ...player.dailyResults,
                  customersWon: player.dailyResults.customersWon + 1,
                  customersSoldOut: player.dailyResults.customersSoldOut + 1,
                },
              }
            : {
                ...player,
                dailyResults: {
                  ...player.dailyResults,
                  customersSkipped: player.dailyResults.customersSkipped + 1,
                },
              },
        ),
      }
      events.push({
        id: `customer-${customerIndex}`,
        customerIndex,
        spawnAt: timing.spawnAt,
        resolveAt: timing.resolveAt,
        targetPlayerId: winnerId,
        outcome: 'soldOut',
        salePrice: 0,
        satisfaction: 0,
        willingnessToPay,
        lane: timing.lane,
        xJitter: timing.xJitter,
        yJitter: timing.yJitter,
      })
      continue
    }

    const recipeFit = calculateRecipeFit(chosenPlayer.dailyPlan.recipe, room.weather, balance)
    const satisfaction = calculateSatisfactionScore(
      recipeFit,
      chosenPlayer.dailyPlan.price,
      willingnessToPay,
    )
    satisfactionTotals.set(winnerId, (satisfactionTotals.get(winnerId) ?? 0) + satisfaction)

    nextRoom = {
      ...nextRoom,
      players: nextRoom.players.map((player) =>
        player.id === winnerId
          ? {
              ...player,
              inventory: subtractInventory(player.inventory, player.dailyPlan.recipe),
              money: roundMoney(player.money + player.dailyPlan.price),
              dailyResults: {
                ...player.dailyResults,
                cupsSold: player.dailyResults.cupsSold + 1,
                revenue: roundMoney(player.dailyResults.revenue + player.dailyPlan.price),
                customersWon: player.dailyResults.customersWon + 1,
              },
            }
          : {
              ...player,
              dailyResults: {
                ...player.dailyResults,
                customersSkipped: player.dailyResults.customersSkipped + 1,
              },
            },
      ),
    }

    events.push({
      id: `customer-${customerIndex}`,
      customerIndex,
      spawnAt: timing.spawnAt,
      resolveAt: timing.resolveAt,
      targetPlayerId: winnerId,
      outcome: 'buy',
      salePrice: chosenPlayer.dailyPlan.price,
      satisfaction,
      willingnessToPay,
      lane: timing.lane,
      xJitter: timing.xJitter,
      yJitter: timing.yJitter,
    })
  }

  return {
    ...nextRoom,
    phase: 'simulating',
    pausedPhase: null,
    players: finalizePlayers(nextRoom, satisfactionTotals, balance),
    simulation: {
      events,
      durationMs,
      totalCustomers,
    },
  }
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

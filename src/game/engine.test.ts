import { describe, expect, it } from 'vitest'

import { defaultBalanceConfig } from './balance'
import {
  beginNextDay,
  calculatePerIngredientCapacity,
  calculateSellableCups,
  calculateSatisfactionScore,
  calculateStandScore,
  createRoom,
  customerCountForWeather,
  enterResultsPhase,
  joinRoom,
  roomCanStartSimulation,
  setPlayerReady,
  startSimulation,
  startSimulationWithTelemetry,
  updatePlayerPlan,
} from './engine'
import type { RoomState } from './types'

function createPlanningRoom(seed = 42): RoomState {
  return joinRoom(
    createRoom({
      roomId: 'ROOM-42',
      hostPlayerId: 'player-host',
      hostPlayerName: 'Alex',
      hostSessionId: 'session-host',
      hostFactionId: 'sun-guild',
      gameMode: 'multiplayer',
      targetPlayerCount: 2,
      seed,
    }),
    {
      playerId: 'player-guest',
      playerName: 'Blair',
      sessionId: 'session-guest',
      factionId: 'market-tide',
    },
  )
}

function createSingleplayerPlanningRoom(seed = 42): RoomState {
  return createRoom({
    roomId: 'SOLO-42',
    hostPlayerId: 'player-host',
    hostPlayerName: 'Alex',
    hostSessionId: 'session-host',
    hostFactionId: 'sun-guild',
    gameMode: 'singleplayer',
    targetPlayerCount: 1,
    seed,
  })
}

describe('multiplayer engine', () => {
  it('creates room defaults and enters planning once both players are present', () => {
    const room = createPlanningRoom(7)

    expect(room.phase).toBe('planning')
    expect(room.weather).not.toBeNull()
    expect(room.marketBasePrices).not.toBeNull()
    expect(room.players).toHaveLength(2)
    expect(room.players[0].money).toBe(20)
    expect(room.players[0].reputation).toBe(50)
    expect(room.players[0].faction.id).toBe('sun-guild')
    expect(room.players[1].faction.id).toBe('market-tide')
    expect(defaultBalanceConfig.simulationDurationMs).toBe(28_000)
  })

  it('creates a planning singleplayer room immediately when the target count is one', () => {
    const room = createSingleplayerPlanningRoom(7)

    expect(room.phase).toBe('planning')
    expect(room.players).toHaveLength(1)
    expect(room.maxPlayers).toBe(1)
  })

  it('keeps plan updates isolated to the targeted player', () => {
    const room = updatePlayerPlan(createPlanningRoom(), 'player-host', {
      price: 1.1,
      recipe: {
        lemons: 1,
        sugar: 3,
        ice: 4,
      },
    })

    const host = room.players.find((player) => player.id === 'player-host')
    const guest = room.players.find((player) => player.id === 'player-guest')

    expect(host?.dailyPlan.price).toBe(1.1)
    expect(host?.dailyPlan.recipe.ice).toBe(4)
    expect(guest?.dailyPlan.price).toBe(defaultBalanceConfig.defaultPrice)
    expect(guest?.dailyPlan.recipe).toEqual(defaultBalanceConfig.defaultRecipe)
  })

  it('clamps lemons and sugar to a positive decimal while allowing ice to reach zero', () => {
    const room = updatePlayerPlan(createPlanningRoom(), 'player-host', {
      recipe: {
        lemons: 0,
        sugar: 0,
        ice: 0,
      },
    })

    const host = room.players.find((player) => player.id === 'player-host')

    expect(host?.dailyPlan.recipe).toEqual({
      lemons: 0.1,
      sugar: 0.1,
      ice: 0,
    })
  })

  it('preserves fractional recipe values when they stay above the minimum', () => {
    const room = updatePlayerPlan(createPlanningRoom(), 'player-host', {
      recipe: {
        lemons: 0.5,
        sugar: 0.3,
        ice: 1.2,
      },
    })

    const host = room.players.find((player) => player.id === 'player-host')

    expect(host?.dailyPlan.recipe).toEqual({
      lemons: 0.5,
      sugar: 0.3,
      ice: 1.2,
    })
  })

  it('calculates sellable cups correctly for fractional recipes', () => {
    expect(
      calculateSellableCups(
        {
          lemons: 0.3,
          sugar: 0.3,
          ice: 0,
        },
        {
          lemons: 0.1,
          sugar: 0.1,
          ice: 0,
        },
      ),
    ).toBe(3)
  })

  it('derives weather customer pools from the balance config', () => {
    expect(customerCountForWeather('hot')).toBe(50)
    expect(customerCountForWeather('raining')).toBe(15)
  })

  it('scales customer count from the two-player baseline using the configured player count', () => {
    expect(customerCountForWeather('hot', 1)).toBe(25)
    expect(customerCountForWeather('sunny', 1)).toBe(15)
    expect(customerCountForWeather('raining', 1)).toBe(8)
    expect(customerCountForWeather('hot', 2)).toBe(50)
  })

  it('prefers the cheaper stand when recipe and reputation match', () => {
    const cheaper = calculateStandScore(
      {
        willingnessToPay: 2,
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 4,
        },
        price: 1.2,
        reputation: 50,
      },
      'hot',
    )
    const pricier = calculateStandScore(
      {
        willingnessToPay: 2,
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 4,
        },
        price: 1.6,
        reputation: 50,
      },
      'hot',
    )

    expect(cheaper).toBeGreaterThan(pricier)
  })

  it('prefers the better weather-fit recipe when prices are close', () => {
    const matched = calculateStandScore(
      {
        willingnessToPay: 2.2,
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 4,
        },
        price: 1.5,
        reputation: 50,
      },
      'hot',
    )
    const mismatched = calculateStandScore(
      {
        willingnessToPay: 2.2,
        recipe: {
          lemons: 4,
          sugar: 4,
          ice: 0,
        },
        price: 1.45,
        reputation: 50,
      },
      'hot',
    )

    expect(matched).toBeGreaterThan(mismatched)
  })

  it('allows reputation to overcome a small price disadvantage', () => {
    const trusted = calculateStandScore(
      {
        willingnessToPay: 2.1,
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
        price: 1.5,
        reputation: 90,
      },
      'sunny',
    )
    const bargain = calculateStandScore(
      {
        willingnessToPay: 2.1,
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
        price: 1.4,
        reputation: 30,
      },
      'sunny',
    )

    expect(trusted).toBeGreaterThan(bargain)
  })

  it('returns zero when the price exceeds willingness to pay', () => {
    const score = calculateStandScore(
      {
        willingnessToPay: 1.25,
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
        price: 1.5,
        reputation: 50,
      },
      'sunny',
    )

    expect(score).toBe(0)
  })

  it('applies a quadratic falloff to satisfaction for recipe fit and price', () => {
    expect(calculateSatisfactionScore(0.5, 1, 2)).toBe(0.25)
  })

  it('resolves ties deterministically from the room seed', () => {
    const readyFirst = setPlayerReady(
      setPlayerReady(createPlanningRoom(123), 'player-host', true),
      'player-guest',
      true,
    )
    const readySecond = setPlayerReady(
      setPlayerReady(createPlanningRoom(123), 'player-host', true),
      'player-guest',
      true,
    )

    expect(roomCanStartSimulation(readyFirst)).toBe(true)

    const first = startSimulation(readyFirst)
    const second = startSimulation(readySecond)

    expect(first.simulation?.events).toEqual(second.simulation?.events)
    expect(first.players.map((player) => player.dailyResults)).toEqual(
      second.players.map((player) => player.dailyResults),
    )
  })

  it('allows a solo room to start simulation when the only player is ready', () => {
    const readySoloRoom = setPlayerReady(createSingleplayerPlanningRoom(123), 'player-host', true)

    expect(roomCanStartSimulation(readySoloRoom)).toBe(true)

    const simulated = startSimulation(readySoloRoom)

    expect(simulated.phase).toBe('simulating')
    expect(simulated.simulation?.events.length).toBeGreaterThan(0)
  })

  it('lets a slight stand advantage win more often without taking every customer', () => {
    const deterministicSunnyBalance = {
      ...defaultBalanceConfig,
      weatherProfiles: {
        ...defaultBalanceConfig.weatherProfiles,
        sunny: {
          ...defaultBalanceConfig.weatherProfiles.sunny,
          customerCount: 200,
          baseWillingnessToPay: 3,
          willingnessVariance: 0,
        },
      },
    }
    let hostSales = 0
    let guestSales = 0

    for (let seed = 1; seed <= 400; seed += 1) {
      let room: RoomState = createPlanningRoom(seed)
      room = {
        ...room,
        weather: 'sunny',
        marketBasePrices: {
          lemons: 0.3,
          sugar: 0.2,
          ice: 0.1,
        },
        players: room.players.map((player) => ({
          ...player,
          inventory: {
            lemons: 200,
            sugar: 200,
            ice: 0,
          },
        })),
      }
      room = updatePlayerPlan(room, 'player-host', {
        price: 1.45,
        recipe: {
          lemons: 1,
          sugar: 1,
          ice: 0,
        },
      })
      room = updatePlayerPlan(room, 'player-guest', {
        price: 1.5,
        recipe: {
          lemons: 1,
          sugar: 1,
          ice: 0,
        },
      })
      room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

      const simulated = startSimulation(room, {}, deterministicSunnyBalance)
      const host = simulated.players.find((player) => player.id === 'player-host')
      const guest = simulated.players.find((player) => player.id === 'player-guest')

      hostSales += host?.dailyResults.cupsSold ?? 0
      guestSales += guest?.dailyResults.cupsSold ?? 0
    }

    expect(hostSales).toBeGreaterThan(guestSales)
    expect(guestSales).toBeGreaterThan(0)
  })

  it('prevents overselling when a winning stand runs out of inventory', () => {
    let room = createPlanningRoom(5)
    room = updatePlayerPlan(room, 'player-host', {
      purchases: {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      recipe: {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      price: 0.5,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      price: 3,
    })
    room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

    const simulated = startSimulation(room)
    const host = simulated.players.find((player) => player.id === 'player-host')

    expect(host?.dailyResults.cupsSold).toBe(1)
    expect(host?.dailyResults.customersSoldOut).toBeGreaterThan(0)
  })

  it('emits customer telemetry reasons and offer-score details for price rejection and sold-out outcomes', () => {
    let priceRejectedRoom = createPlanningRoom(13)
    priceRejectedRoom = {
      ...priceRejectedRoom,
      weather: 'sunny',
      marketBasePrices: {
        lemons: 0.3,
        sugar: 0.2,
        ice: 0.1,
      },
      customerRoster: [
        {
          id: 'price-sensitive',
          tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
          standHistory: {},
        },
      ],
    }
    priceRejectedRoom = updatePlayerPlan(priceRejectedRoom, 'player-host', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 4,
    })
    priceRejectedRoom = updatePlayerPlan(priceRejectedRoom, 'player-guest', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 4,
    })
    priceRejectedRoom = setPlayerReady(setPlayerReady(priceRejectedRoom, 'player-host', true), 'player-guest', true)

    const priceRejected = startSimulationWithTelemetry(priceRejectedRoom, {}, {
      ...defaultBalanceConfig,
      weatherProfiles: {
        ...defaultBalanceConfig.weatherProfiles,
        sunny: {
          ...defaultBalanceConfig.weatherProfiles.sunny,
          customerCount: 1,
          baseWillingnessToPay: 1.5,
          willingnessVariance: 0,
        },
      },
    })

    expect(priceRejected.telemetry.customerProfiles).toEqual([
      {
        customerId: 'price-sensitive',
        tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
      },
    ])
    expect(priceRejected.telemetry.customerEvents).toEqual([
      expect.objectContaining({
        customerId: 'price-sensitive',
        outcomeReason: 'all_prices_above_willingness',
        chosenPlayerId: null,
      }),
    ])
    expect(priceRejected.telemetry.customerOfferScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: 'player-host',
          offerResult: 'price_rejected',
          totalScore: 0,
        }),
        expect.objectContaining({
          playerId: 'player-guest',
          offerResult: 'price_rejected',
          totalScore: 0,
        }),
      ]),
    )

    let soldOutRoom = createPlanningRoom(5)
    soldOutRoom = updatePlayerPlan(soldOutRoom, 'player-host', {
      purchases: {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      recipe: {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      price: 0.5,
    })
    soldOutRoom = updatePlayerPlan(soldOutRoom, 'player-guest', {
      price: 3,
    })
    soldOutRoom = setPlayerReady(setPlayerReady(soldOutRoom, 'player-host', true), 'player-guest', true)

    const soldOut = startSimulationWithTelemetry(soldOutRoom)
    const soldOutEvent = soldOut.telemetry.customerEvents.find((event) => event.outcomeReason === 'selected_stand_sold_out')

    expect(soldOutEvent).toBeDefined()
    expect(
      soldOut.telemetry.customerOfferScores.some(
        (score) =>
          score.customerEventId === soldOutEvent?.customerEventId &&
          score.playerId === 'player-host' &&
          score.offerResult === 'selected_but_sold_out',
      ),
    ).toBe(true)
    expect(
      soldOut.room.simulation?.events.find((event) => event.outcome === 'soldOut')?.standStops.every(
        (stop) => stop.departAt === stop.arriveAt,
      ),
    ).toBe(true)
  })

  it('creates sequential stand stops for multiplayer customers moving left to right', () => {
    let room = createPlanningRoom(41)
    room = {
      ...room,
      weather: 'sunny',
      marketBasePrices: {
        lemons: 0.3,
        sugar: 0.2,
        ice: 0.1,
      },
      customerRoster: [
        {
          id: 'customer-right',
          tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
          standHistory: {},
        },
      ],
    }
    room = updatePlayerPlan(room, 'player-host', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 2.3,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 1.5,
    })
    room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

    const simulated = startSimulation(room, {}, {
      ...defaultBalanceConfig,
      weatherProfiles: {
        ...defaultBalanceConfig.weatherProfiles,
        sunny: {
          ...defaultBalanceConfig.weatherProfiles.sunny,
          customerCount: 1,
          baseWillingnessToPay: 2,
          willingnessVariance: 0,
        },
      },
    })

    const event = simulated.simulation?.events[0]

    expect(event).toBeDefined()
    expect(event?.targetPlayerId).toBe('player-guest')
    expect(event?.standStops.map((stop) => stop.playerId)).toEqual(['player-host', 'player-guest'])
    expect(event?.standStops[0]).toEqual({
      playerId: 'player-host',
      arriveAt: 1_200,
      departAt: 2_200,
    })
    expect(event?.standStops[1]).toEqual({
      playerId: 'player-guest',
      arriveAt: 2_900,
      departAt: 3_900,
    })
    expect(event?.outcomeAt).toBe(3_900)
    expect(event?.exitAt).toBe(4_800)
    expect(simulated.simulation?.durationMs).toBeGreaterThanOrEqual(4_800)
  })

  it('records day history entries and preserves them into the next planning day', () => {
    let room = createPlanningRoom(91)
    room = {
      ...room,
      weather: 'sunny',
      marketBasePrices: {
        lemons: 0.5,
        sugar: 0.25,
        ice: 0.1,
      },
    }
    room = updatePlayerPlan(room, 'player-host', {
      purchases: {
        lemons: 6,
        sugar: 6,
        ice: 6,
      },
      price: 1.1,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: {
        lemons: 3,
        sugar: 3,
        ice: 3,
      },
      price: 3,
    })
    room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

    const simulated = startSimulation(room, {}, {
      ...defaultBalanceConfig,
      weatherProfiles: {
        ...defaultBalanceConfig.weatherProfiles,
        sunny: {
          ...defaultBalanceConfig.weatherProfiles.sunny,
          customerCount: 1,
          baseWillingnessToPay: 2,
          willingnessVariance: 0,
        },
      },
    })
    const hostResults = simulated.players.find((player) => player.id === 'player-host')
    const nextDay = beginNextDay(enterResultsPhase(simulated))
    const nextDayHost = nextDay.players.find((player) => player.id === 'player-host')

    expect(hostResults?.history).toEqual([
      expect.objectContaining({
        day: 1,
        revenue: 1.1,
        purchaseCost: 5.1,
        profit: -4,
        endingMoney: hostResults?.money,
        reputationAfter: hostResults?.reputation,
        cupsSold: 1,
        recipeSnapshot: {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
      }),
    ])
    expect(nextDayHost?.history).toEqual(hostResults?.history)
    expect(nextDayHost?.dailyResults.cupsSold).toBe(0)
  })

  it('carries money, inventory, and reputation into the next planning day', () => {
    let room = createPlanningRoom(91)
    room = updatePlayerPlan(room, 'player-host', {
      purchases: {
        lemons: 6,
        sugar: 6,
        ice: 6,
      },
      price: 1.1,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: {
        lemons: 6,
        sugar: 6,
        ice: 6,
      },
      price: 1.2,
    })
    room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

    const simulated = startSimulation(room)
    const nextDay = beginNextDay(enterResultsPhase(simulated))
    const host = nextDay.players.find((player) => player.id === 'player-host')

    expect(nextDay.phase).toBe('planning')
    expect(nextDay.day).toBe(2)
    expect(nextDay.weather).not.toBeNull()
    expect(nextDay.marketBasePrices).not.toBeNull()
    expect(host?.money).not.toBe(defaultBalanceConfig.startingMoney)
    expect(host?.dailyResults.cupsSold).toBe(0)
    expect(host?.isReady).toBe(false)
  })
})

describe('calculatePerIngredientCapacity', () => {
  it('returns per-ingredient cup counts based on inventory and recipe', () => {
    expect(
      calculatePerIngredientCapacity(
        { lemons: 10, sugar: 6, ice: 9 },
        { lemons: 2, sugar: 3, ice: 3 },
      ),
    ).toEqual({ lemons: 5, sugar: 2, ice: 3 })
  })

  it('returns Infinity for ingredients with zero recipe requirement', () => {
    expect(
      calculatePerIngredientCapacity(
        { lemons: 10, sugar: 6, ice: 0 },
        { lemons: 2, sugar: 3, ice: 0 },
      ),
    ).toEqual({ lemons: 5, sugar: 2, ice: Infinity })
  })

  it('handles fractional recipe values', () => {
    expect(
      calculatePerIngredientCapacity(
        { lemons: 0.3, sugar: 0.3, ice: 0 },
        { lemons: 0.1, sugar: 0.1, ice: 0 },
      ),
    ).toEqual({ lemons: 3, sugar: 3, ice: Infinity })
  })

  it('returns zero when inventory is empty and recipe requires ingredients', () => {
    expect(
      calculatePerIngredientCapacity(
        { lemons: 0, sugar: 0, ice: 0 },
        { lemons: 2, sugar: 2, ice: 2 },
      ),
    ).toEqual({ lemons: 0, sugar: 0, ice: 0 })
  })
})

describe('persistent customer profiles', () => {
  const persistentBalance = {
    ...defaultBalanceConfig,
    weatherProfiles: {
      sunny: {
        ...defaultBalanceConfig.weatherProfiles.sunny,
        customerCount: 3,
        baseWillingnessToPay: 3,
        willingnessVariance: 0,
      },
      hot: {
        ...defaultBalanceConfig.weatherProfiles.hot,
        customerCount: 2,
        baseWillingnessToPay: 3,
        willingnessVariance: 0,
      },
      cloudy: {
        ...defaultBalanceConfig.weatherProfiles.cloudy,
        customerCount: 2,
        baseWillingnessToPay: 3,
        willingnessVariance: 0,
      },
      raining: {
        ...defaultBalanceConfig.weatherProfiles.raining,
        customerCount: 1,
        baseWillingnessToPay: 3,
        willingnessVariance: 0,
      },
    },
  }

  function readyRoom(room: RoomState): RoomState {
    return setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)
  }

  function forcePlanningWeather(room: RoomState, weather: keyof typeof persistentBalance.weatherProfiles): RoomState {
    return {
      ...room,
      weather,
      marketBasePrices: {
        lemons: 0.3,
        sugar: 0.2,
        ice: 0.1,
      },
    }
  }

  it('generates a deterministic customer roster from the room seed', () => {
    const first = createRoom({
      roomId: 'ROOM-A',
      hostPlayerId: 'player-host',
      hostPlayerName: 'Alex',
      hostSessionId: 'session-host',
      gameMode: 'multiplayer',
      targetPlayerCount: 2,
      seed: 17,
    }, persistentBalance)
    const second = createRoom({
      roomId: 'ROOM-A',
      hostPlayerId: 'player-host',
      hostPlayerName: 'Alex',
      hostSessionId: 'session-host',
      gameMode: 'multiplayer',
      targetPlayerCount: 2,
      seed: 17,
    }, persistentBalance)
    const third = createRoom({
      roomId: 'ROOM-A',
      hostPlayerId: 'player-host',
      hostPlayerName: 'Alex',
      hostSessionId: 'session-host',
      gameMode: 'multiplayer',
      targetPlayerCount: 2,
      seed: 18,
    }, persistentBalance)
    const expectedRosterSize = Math.max(
      ...Object.values(persistentBalance.weatherProfiles).map((profile) => profile.customerCount),
    )

    expect(first.customerRoster).toHaveLength(expectedRosterSize)
    expect(new Set(first.customerRoster.map((customer) => customer.id)).size).toBe(expectedRosterSize)
    expect(first.customerRoster).toEqual(second.customerRoster)
    expect(third.customerRoster).not.toEqual(first.customerRoster)
  })

  it('reuses the same customer roster across days when sampling repeat customers', () => {
    const customerRoster = [
      {
        id: 'customer-alpha',
        tasteOffsets: { lemons: 1, sugar: 0, ice: 0 },
        standHistory: {},
      },
      {
        id: 'customer-bravo',
        tasteOffsets: { lemons: 0, sugar: 1, ice: 0 },
        standHistory: {},
      },
      {
        id: 'customer-charlie',
        tasteOffsets: { lemons: 0, sugar: 0, ice: -1 },
        standHistory: {},
      },
    ]

    const runTwoDays = () => {
      let room = createPlanningRoom(29)
      room = {
        ...forcePlanningWeather(room, 'sunny'),
        customerRoster,
      }
      room = updatePlayerPlan(room, 'player-host', {
        purchases: { lemons: 12, sugar: 12, ice: 12 },
        price: 1.2,
      })
      room = updatePlayerPlan(room, 'player-guest', {
        purchases: { lemons: 12, sugar: 12, ice: 12 },
        price: 2.8,
      })
      room = readyRoom(room)

      const firstDay = startSimulation(room, {}, persistentBalance)
      const nextDayPlanning = beginNextDay(enterResultsPhase(firstDay), persistentBalance)
      const secondDay = startSimulation(
        readyRoom(
          updatePlayerPlan(
            updatePlayerPlan(
              {
                ...forcePlanningWeather(nextDayPlanning, 'cloudy'),
              },
              'player-host',
              {
                purchases: { lemons: 0, sugar: 0, ice: 0 },
                price: 1.2,
              },
            ),
            'player-guest',
            {
              purchases: { lemons: 0, sugar: 0, ice: 0 },
              price: 2.8,
            },
          ),
        ),
        {},
        persistentBalance,
      )

      return {
        firstDayCustomerIds: firstDay.simulation?.events.map((event) => event.customerId) ?? [],
        secondDayCustomerIds: secondDay.simulation?.events.map((event) => event.customerId) ?? [],
        secondDayRoster: secondDay.customerRoster,
      }
    }

    const firstRun = runTwoDays()
    const secondRun = runTwoDays()

    expect(firstRun.firstDayCustomerIds).toEqual(secondRun.firstDayCustomerIds)
    expect(firstRun.secondDayCustomerIds).toEqual(secondRun.secondDayCustomerIds)
    expect(new Set(firstRun.firstDayCustomerIds)).toEqual(
      new Set(customerRoster.map((customer) => customer.id)),
    )
    expect(firstRun.secondDayCustomerIds).toHaveLength(2)
    expect(firstRun.secondDayCustomerIds.every((id) => firstRun.firstDayCustomerIds.includes(id))).toBe(true)
    expect(firstRun.secondDayRoster.map((customer) => customer.id)).toEqual(
      customerRoster.map((customer) => customer.id),
    )
  })

  it('lets taste profiles choose different stands under identical weather and prices', () => {
    let hostSales = 0
    let guestSales = 0

    for (let seed = 1; seed <= 40; seed += 1) {
      let room = createPlanningRoom(seed)
      room = {
        ...forcePlanningWeather(room, 'sunny'),
        customerRoster: [
          {
            id: 'customer-preferred',
            tasteOffsets: { lemons: 1, sugar: 1, ice: -2 },
            standHistory: {},
          },
        ],
      }
      room = updatePlayerPlan(room, 'player-host', {
        purchases: { lemons: 6, sugar: 6, ice: 6 },
        recipe: { lemons: 0, sugar: 0, ice: 5 },
        price: 1.5,
      })
      room = updatePlayerPlan(room, 'player-guest', {
        purchases: { lemons: 6, sugar: 6, ice: 6 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 1.5,
      })
      room = readyRoom(room)

      const simulated = startSimulation(room, {}, {
        ...persistentBalance,
        weatherProfiles: {
          ...persistentBalance.weatherProfiles,
          sunny: {
            ...persistentBalance.weatherProfiles.sunny,
            customerCount: 1,
          },
        },
      })
      const host = simulated.players.find((player) => player.id === 'player-host')
      const guest = simulated.players.find((player) => player.id === 'player-guest')

      hostSales += host?.dailyResults.cupsSold ?? 0
      guestSales += guest?.dailyResults.cupsSold ?? 0
    }

    expect(guestSales).toBeGreaterThan(hostSales)
  })

  it('updates repeat customer history so the same customer can shift preference across days', () => {
    let hostDayTwoSales = 0
    let hostDayTwoFreshSales = 0
    let hostDayThreeSales = 0
    let guestDayThreeSales = 0

    for (let seed = 1; seed <= 60; seed += 1) {
      let room = createPlanningRoom(seed)
      room = {
        ...forcePlanningWeather(room, 'raining'),
        customerRoster: [
          {
            id: 'repeat-customer',
            tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
            standHistory: {},
          },
        ],
      }
      room = updatePlayerPlan(room, 'player-host', {
        purchases: { lemons: 6, sugar: 6, ice: 0 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 1.3,
      })
      room = updatePlayerPlan(room, 'player-guest', {
        purchases: { lemons: 6, sugar: 6, ice: 0 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 4,
      })
      room = readyRoom(room)

      const firstDay = startSimulation(room, {}, {
        ...persistentBalance,
        weatherProfiles: {
          ...persistentBalance.weatherProfiles,
          raining: {
            ...persistentBalance.weatherProfiles.raining,
            customerCount: 1,
          },
        },
      })
      const firstCustomer = firstDay.customerRoster.find((customer) => customer.id === 'repeat-customer')

      expect(firstCustomer).toBeDefined()
      expect(firstCustomer!.standHistory['player-host']?.purchases).toBe(1)
      expect(firstCustomer!.standHistory['player-host']?.lastDaySeen).toBe(1)
      expect(firstCustomer!.standHistory['player-host']?.rollingAverageSatisfaction).toBeGreaterThan(0)

      let secondDay = beginNextDay(enterResultsPhase(firstDay), persistentBalance)
      secondDay = forcePlanningWeather(secondDay, 'raining')
      secondDay = updatePlayerPlan(secondDay, 'player-host', {
        purchases: { lemons: 3, sugar: 3, ice: 3 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 1.5,
      })
      secondDay = updatePlayerPlan(secondDay, 'player-guest', {
        purchases: { lemons: 3, sugar: 3, ice: 3 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 1.5,
      })
      secondDay = readyRoom(secondDay)

      const secondDayResults = startSimulation(secondDay, {}, {
        ...persistentBalance,
        weatherProfiles: {
          ...persistentBalance.weatherProfiles,
          raining: {
            ...persistentBalance.weatherProfiles.raining,
            customerCount: 1,
          },
        },
      })
      hostDayTwoSales += secondDayResults.players.find((player) => player.id === 'player-host')?.dailyResults.cupsSold ?? 0

      let freshSecondDay = createPlanningRoom(seed)
      freshSecondDay = {
        ...forcePlanningWeather(freshSecondDay, 'raining'),
        customerRoster: [
          {
            id: 'repeat-customer',
            tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
            standHistory: {},
          },
        ],
      }
      freshSecondDay = updatePlayerPlan(freshSecondDay, 'player-host', {
        purchases: { lemons: 3, sugar: 3, ice: 3 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 1.5,
      })
      freshSecondDay = updatePlayerPlan(freshSecondDay, 'player-guest', {
        purchases: { lemons: 3, sugar: 3, ice: 3 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 1.5,
      })
      freshSecondDay = readyRoom(freshSecondDay)

      const freshSecondDayResults = startSimulation(freshSecondDay, {}, {
        ...persistentBalance,
        weatherProfiles: {
          ...persistentBalance.weatherProfiles,
          raining: {
            ...persistentBalance.weatherProfiles.raining,
            customerCount: 1,
          },
        },
      })
      hostDayTwoFreshSales +=
        freshSecondDayResults.players.find((player) => player.id === 'player-host')?.dailyResults.cupsSold ?? 0

      let thirdDay = beginNextDay(enterResultsPhase(secondDayResults), persistentBalance)
      thirdDay = forcePlanningWeather(thirdDay, 'raining')
      thirdDay = updatePlayerPlan(thirdDay, 'player-host', {
        purchases: { lemons: 3, sugar: 3, ice: 3 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 1.55,
      })
      thirdDay = updatePlayerPlan(thirdDay, 'player-guest', {
        purchases: { lemons: 3, sugar: 3, ice: 3 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 0.5,
      })
      thirdDay = readyRoom(thirdDay)

      const thirdDayResults = startSimulation(thirdDay, {}, {
        ...persistentBalance,
        weatherProfiles: {
          ...persistentBalance.weatherProfiles,
          raining: {
            ...persistentBalance.weatherProfiles.raining,
            customerCount: 1,
          },
        },
      })
      hostDayThreeSales += thirdDayResults.players.find((player) => player.id === 'player-host')?.dailyResults.cupsSold ?? 0
      guestDayThreeSales += thirdDayResults.players.find((player) => player.id === 'player-guest')?.dailyResults.cupsSold ?? 0
    }

    expect(hostDayTwoSales).toBeGreaterThan(hostDayTwoFreshSales)
    expect(guestDayThreeSales).toBeGreaterThan(hostDayThreeSales)
  })

  it('still enforces price ceilings after profile state is introduced', () => {
    let room = createPlanningRoom(41)
    room = {
      ...forcePlanningWeather(room, 'sunny'),
      customerRoster: [
        {
          id: 'price-sensitive',
          tasteOffsets: { lemons: 1, sugar: 0, ice: 0 },
          standHistory: {},
        },
      ],
    }
    room = updatePlayerPlan(room, 'player-host', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 1.1,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      price: 5,
    })
    room = readyRoom(room)

    const simulated = startSimulation(room, {}, {
      ...persistentBalance,
      weatherProfiles: {
        ...persistentBalance.weatherProfiles,
        sunny: {
          ...persistentBalance.weatherProfiles.sunny,
          customerCount: 1,
          baseWillingnessToPay: 0.75,
          willingnessVariance: 0,
        },
      },
    })
    const host = simulated.players.find((player) => player.id === 'player-host')
    const guest = simulated.players.find((player) => player.id === 'player-guest')

    expect(host?.dailyResults.cupsSold).toBe(0)
    expect(guest?.dailyResults.cupsSold).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'

import { defaultBalanceConfig } from './balance'
import {
  beginNextDay,
  calculatePerIngredientCapacity,
  calculateRecipeFeedbackHint,
  calculateSellableCups,
  calculateSatisfactionScore,
  calculateStandScore,
  _calculateReputationDelta,
  _effectiveWtp,
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

  it('applies a quadratic falloff to recipe fit but uses concave curve for price', () => {
    // recipeFit=0.5, price=1, wtp=2 (50% of WTP)
    // recipe component: curveScore(0.5) = 0.25, weighted: 0.25 * 0.7 = 0.175
    // price component: concave curve at 50% WTP → near-perfect score (~0.98+)
    // Total should be much higher than old value of 0.25
    const satisfaction = calculateSatisfactionScore(0.5, 1, 2)
    expect(satisfaction).toBeGreaterThan(0.45)
    expect(satisfaction).toBeLessThan(0.50)
  })

  it('returns 0 price score when price equals WTP', () => {
    // price === wtp → priceScore = 0
    // With perfect recipe (fit=1.0): satisfaction = 1.0*0.7 + 0*0.3 = 0.7
    expect(calculateSatisfactionScore(1.0, 2.0, 2.0)).toBe(0.7)
  })

  it('returns maximum price score when price is 0', () => {
    // price = 0 → priceScore = 1.0 → curveScore = 1.0
    // With perfect recipe: satisfaction = 1.0*0.7 + 1.0*0.3 = 1.0
    expect(calculateSatisfactionScore(1.0, 0, 2.0)).toBe(1.0)
  })

  it('gives ~0.7 curved price score at 75% of WTP', () => {
    // price = 1.5, wtp = 2.0 (75% of WTP)
    // With perfect recipe (fit=1.0), recipe component = 0.7
    // price component should be ~0.7 * 0.3 = 0.21
    // Total satisfaction should be ~0.91
    const satisfaction = calculateSatisfactionScore(1.0, 1.5, 2.0)
    expect(satisfaction).toBeCloseTo(0.91, 1)
  })

  it('gives high price score at 50% of WTP', () => {
    // price = 1.0, wtp = 2.0 → half price is very generous
    // With perfect recipe: satisfaction should be near 1.0
    const satisfaction = calculateSatisfactionScore(1.0, 1.0, 2.0)
    expect(satisfaction).toBeGreaterThan(0.95)
  })

  it('produces satisfaction in 0.55-0.75 range for typical good play', () => {
    // recipe_fit=0.85, price=$1.50, wtp=$2.00
    // This is the plan's verification case
    const satisfaction = calculateSatisfactionScore(0.85, 1.5, 2.0)
    expect(satisfaction).toBeGreaterThan(0.55)
    expect(satisfaction).toBeLessThan(0.75)
  })

  it('selects the strongest recipe feedback hint with deterministic tie-breaking', () => {
    expect(
      calculateRecipeFeedbackHint(
        {
          lemons: 1,
          sugar: 1,
          ice: 1,
        },
        {
          lemons: 4,
          sugar: 4,
          ice: 4,
        },
      ),
    ).toEqual({
      ingredient: 'lemons',
      direction: 'more',
    })

    expect(
      calculateRecipeFeedbackHint(
        {
          lemons: 3,
          sugar: 4,
          ice: 2,
        },
        {
          lemons: 1,
          sugar: 2,
          ice: 5,
        },
      ),
    ).toEqual({
      ingredient: 'ice',
      direction: 'more',
    })

    expect(
      calculateRecipeFeedbackHint(
        {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
        {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
      ),
    ).toBeNull()
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
        price: 2.2,
        recipe: {
          lemons: 1,
          sugar: 1,
          ice: 0,
        },
      })
      room = updatePlayerPlan(room, 'player-guest', {
        price: 2.5,
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

  it('emits customer telemetry reasons and offer-score details for price rejection', () => {
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
      players: priceRejectedRoom.players.map((player) =>
        player.id === 'player-host'
          ? {
              ...player,
              ownedUpgrades: {
                recipeFeedbackHints: true,
                marketEspionage: false,
              },
            }
          : player,
      ),
    }
    priceRejectedRoom = updatePlayerPlan(priceRejectedRoom, 'player-host', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 4, sugar: 2, ice: 2 },
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
    expect(
      priceRejected.room.simulation?.events[0]?.feedbackHintsByPlayerId?.['player-host'],
    ).toEqual({
      ingredient: 'lemons',
      direction: 'less',
    })
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

  })

  it('dampens customer taste offsets when building preferred recipes', () => {
    let room = createPlanningRoom(23)
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
          id: 'taste-weight-customer',
          tasteOffsets: { lemons: 2, sugar: -1, ice: -2 },
          standHistory: {},
        },
      ],
    }
    room = updatePlayerPlan(room, 'player-host', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 1.2,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 1.2,
    })
    room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

    const simulated = startSimulationWithTelemetry(room, {}, {
      ...defaultBalanceConfig,
      customerTastePreferenceWeight: 0.2,
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

    expect(simulated.telemetry.customerEvents[0]).toEqual(
      expect.objectContaining({
        preferredRecipe: {
          lemons: 2.4,
          sugar: 1.8,
          ice: 1.6,
        },
      }),
    )
  })

  it('reroutes customers away from sold-out winners and records reroute telemetry', () => {
    let room = createPlanningRoom(5)
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
          id: 'reroute-customer',
          tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
          standHistory: {},
        },
      ],
    }
    room = updatePlayerPlan(room, 'player-host', {
      purchases: { lemons: 0, sugar: 0, ice: 0 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 0.5,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 1, sugar: 2, ice: 1 },
      price: 1.4,
    })
    room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

    const simulated = startSimulationWithTelemetry(room, {}, {
      ...defaultBalanceConfig,
      customerTastePreferenceWeight: 0.2,
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

    expect(simulated.telemetry.customerEvents).toEqual([
      expect.objectContaining({
        customerId: 'reroute-customer',
        chosenPlayerId: 'player-guest',
        outcome: 'buy',
        outcomeReason: 'purchased_after_sold_out_reroute',
        rerouteCount: 1,
      }),
    ])
    expect(simulated.telemetry.customerOfferScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: 'player-host',
          selectionRound: 1,
          offerResult: 'selected_but_sold_out',
        }),
        expect.objectContaining({
          playerId: 'player-guest',
          selectionRound: 2,
          offerResult: 'selected',
        }),
      ]),
    )

    const host = simulated.room.players.find((player) => player.id === 'player-host')
    const guest = simulated.room.players.find((player) => player.id === 'player-guest')
    const event = simulated.room.simulation?.events[0]

    expect(host?.dailyResults.customersWon).toBe(0)
    expect(host?.dailyResults.customersSoldOut).toBe(1)
    expect(guest?.dailyResults.customersWon).toBe(1)
    expect(guest?.dailyResults.cupsSold).toBe(1)
    expect(event?.targetPlayerId).toBe('player-guest')
    expect(event?.standStops).toEqual([
      expect.objectContaining({
        playerId: 'player-host',
      }),
      expect.objectContaining({
        playerId: 'player-guest',
      }),
    ])
    expect(event?.standStops[0]?.departAt).toBe(event?.standStops[0]?.arriveAt)
    expect((event?.standStops[1]?.departAt ?? 0) - (event?.standStops[1]?.arriveAt ?? 0)).toBe(1000)
    expect((event?.standStops[1]?.arriveAt ?? 0) - (event?.standStops[0]?.departAt ?? 0)).toBeGreaterThan(0)
  })

  it('attaches recipe feedback hints to customer events for upgraded players only', () => {
    let room = createPlanningRoom(19)
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
          id: 'hint-customer',
          tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
          standHistory: {},
        },
      ],
      players: room.players.map((player) =>
        player.id === 'player-host'
          ? {
              ...player,
              ownedUpgrades: {
                recipeFeedbackHints: true,
                marketEspionage: false,
              },
            }
          : player,
      ),
    }
    room = updatePlayerPlan(room, 'player-host', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 1, sugar: 3, ice: 5 },
      price: 1.2,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: { lemons: 6, sugar: 6, ice: 6 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 2.5,
    })
    room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

    const simulated = startSimulationWithTelemetry(room, {}, {
      ...defaultBalanceConfig,
      customerTastePreferenceWeight: 0.2,
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
    const event = simulated.room.simulation?.events[0]

    expect(event?.outcome).toBe('buy')
    expect(event?.feedbackHintsByPlayerId?.['player-host']).toEqual({
      ingredient: 'ice',
      direction: 'less',
    })
    expect(event?.feedbackHintsByPlayerId?.['player-guest']).toBeUndefined()
  })

  it('ends rerouted customers as skipped when every reroute path is exhausted', () => {
    let room = createPlanningRoom(9)
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
          id: 'exhausted-customer',
          tasteOffsets: { lemons: 0, sugar: 0, ice: 0 },
          standHistory: {},
        },
      ],
    }
    room = updatePlayerPlan(room, 'player-host', {
      purchases: { lemons: 0, sugar: 0, ice: 0 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 0.5,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: { lemons: 0, sugar: 0, ice: 0 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 1.2,
    })
    room = setPlayerReady(setPlayerReady(room, 'player-host', true), 'player-guest', true)

    const simulated = startSimulationWithTelemetry(room, {}, {
      ...defaultBalanceConfig,
      customerTastePreferenceWeight: 0.2,
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

    expect(simulated.telemetry.customerEvents).toEqual([
      expect.objectContaining({
        customerId: 'exhausted-customer',
        chosenPlayerId: null,
        outcome: 'skip',
        outcomeReason: 'reroute_exhausted_after_sold_out',
        rerouteCount: 2,
      }),
    ])
    expect(simulated.telemetry.customerOfferScores).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: 'player-guest',
          selectionRound: 1,
          offerResult: 'selected_but_sold_out',
        }),
        expect.objectContaining({
          playerId: 'player-host',
          selectionRound: 2,
          offerResult: 'selected_but_sold_out',
        }),
      ]),
    )
    const event = simulated.room.simulation?.events[0]

    expect(event?.standStops).toEqual([
      expect.objectContaining({
        playerId: 'player-guest',
      }),
      expect.objectContaining({
        playerId: 'player-host',
      }),
    ])
    expect(event?.standStops[0]?.departAt).toBe(event?.standStops[0]?.arriveAt)
    expect(event?.standStops[1]?.departAt).toBe(event?.standStops[1]?.arriveAt)
    expect((event?.standStops[1]?.arriveAt ?? 0) - (event?.standStops[0]?.departAt ?? 0)).toBeGreaterThan(0)
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
      arriveAt: 1_380,
      departAt: 2_380,
    })
    expect(event?.standStops[1]).toEqual({
      playerId: 'player-guest',
      arriveAt: 3_220,
      departAt: 4_220,
    })
    expect(event?.outcomeAt).toBe(4_220)
    expect(event?.exitAt).toBe(5_300)
    expect(simulated.simulation?.durationMs).toBeGreaterThanOrEqual(5_300)
  })

  it('keeps the last customer active near the end of the simulation timeline', () => {
    let room = createPlanningRoom(27)
    room = {
      ...room,
      weather: 'sunny',
      marketBasePrices: {
        lemons: 0.5,
        sugar: 0.2,
        ice: 0.1,
      },
    }
    room = updatePlayerPlan(room, 'player-host', {
      purchases: { lemons: 20, sugar: 20, ice: 20 },
      recipe: { lemons: 2, sugar: 2, ice: 2 },
      price: 2.3,
    })
    room = updatePlayerPlan(room, 'player-guest', {
      purchases: { lemons: 20, sugar: 20, ice: 20 },
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
          customerCount: 6,
          baseWillingnessToPay: 2,
          willingnessVariance: 0,
        },
      },
    })

    const durationMs = simulated.simulation?.durationMs ?? 0
    const lastExitAt = Math.max(...(simulated.simulation?.events ?? []).map((event) => event.exitAt))

    expect(durationMs).toBe(defaultBalanceConfig.simulationDurationMs)
    expect(lastExitAt).toBeGreaterThanOrEqual(durationMs - 500)
    expect(lastExitAt).toBeLessThan(durationMs)
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
    room = {
      ...room,
      players: room.players.map((player) =>
        player.id === 'player-host'
          ? {
              ...player,
              ownedUpgrades: {
                recipeFeedbackHints: true,
                marketEspionage: false,
              },
            }
          : player,
      ),
    }
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
    expect(host?.ownedUpgrades?.recipeFeedbackHints).toBe(true)
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
    customerTastePreferenceWeight: 1,
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
        price: 2.5,
      })
      room = updatePlayerPlan(room, 'player-guest', {
        purchases: { lemons: 6, sugar: 6, ice: 6 },
        recipe: { lemons: 3, sugar: 3, ice: 0 },
        price: 2.5,
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

  describe('reputation delta formula', () => {
    it('produces +4 to +8 delta at satisfaction=0.70 with 25 cups', () => {
      const delta = _calculateReputationDelta(0.70, 25)
      expect(delta).toBeGreaterThanOrEqual(4)
      expect(delta).toBeLessThanOrEqual(8)
    })

    it('produces -4 to -8 delta at satisfaction=0.30 with 25 cups', () => {
      const delta = _calculateReputationDelta(0.30, 25)
      expect(delta).toBeGreaterThanOrEqual(-8)
      expect(delta).toBeLessThanOrEqual(-4)
    })

    it('produces near-zero delta at satisfaction=0.50', () => {
      const delta = _calculateReputationDelta(0.50, 25)
      expect(Math.abs(delta)).toBeLessThanOrEqual(1)
    })

    it('returns -1 when no cups sold', () => {
      const delta = _calculateReputationDelta(0, 0)
      expect(delta).toBe(-1)
    })
  })

  describe('WTP reputation modifier', () => {
    it('increases effective WTP by ~6% at reputation=70', () => {
      const baseWtp = 2.0
      const effective = _effectiveWtp(baseWtp, 70)
      const modifier = effective / baseWtp - 1
      expect(modifier).toBeCloseTo(0.06, 2)
    })

    it('decreases effective WTP by ~6% at reputation=30', () => {
      const baseWtp = 2.0
      const effective = _effectiveWtp(baseWtp, 30)
      const modifier = effective / baseWtp - 1
      expect(modifier).toBeCloseTo(-0.06, 2)
    })

    it('leaves WTP unchanged at reputation=50', () => {
      const baseWtp = 2.0
      const effective = _effectiveWtp(baseWtp, 50)
      expect(effective).toBe(baseWtp)
    })

    it('caps the modifier at ±15%', () => {
      const baseWtp = 2.0
      expect(_effectiveWtp(baseWtp, 100)).toBeLessThanOrEqual(baseWtp * 1.15)
      expect(_effectiveWtp(baseWtp, 0)).toBeGreaterThanOrEqual(baseWtp * 0.85)
    })
  })

  describe('updated scoring weights', () => {
    it('uses 0.25 reputation weight in singleplayer calculateStandScore', () => {
      // With price at 0 (perfect price score=1), perfect recipe (fit=1), rep=100
      // score = 1*wPrice + 1*wRecipe + 1*wRep = wPrice + wRecipe + wRep = 1.0
      const perfectScore = calculateStandScore(
        { willingnessToPay: 2, recipe: { lemons: 2, sugar: 2, ice: 4 }, price: 0, reputation: 100 },
        'hot',
      )
      // With rep=0, score = wPrice + wRecipe + 0 = 1 - wRep
      const zeroRepScore = calculateStandScore(
        { willingnessToPay: 2, recipe: { lemons: 2, sugar: 2, ice: 4 }, price: 0, reputation: 0 },
        'hot',
      )
      const repWeight = perfectScore - zeroRepScore
      expect(repWeight).toBeCloseTo(0.25, 2)
    })
  })
})

describe('weather WTP and ingredient cost margin tuning', () => {
  it('sets rainy baseWillingnessToPay to 1.55', () => {
    expect(defaultBalanceConfig.weatherProfiles.raining.baseWillingnessToPay).toBe(1.55)
  })

  it('sets cloudy baseWillingnessToPay to 1.80', () => {
    expect(defaultBalanceConfig.weatherProfiles.cloudy.baseWillingnessToPay).toBe(1.80)
  })

  it('does not change hot baseWillingnessToPay from 2.0', () => {
    expect(defaultBalanceConfig.weatherProfiles.hot.baseWillingnessToPay).toBe(2)
  })

  it('does not change sunny baseWillingnessToPay from 1.9', () => {
    expect(defaultBalanceConfig.weatherProfiles.sunny.baseWillingnessToPay).toBe(1.9)
  })

  it('sets lemon price band to min 0.20, max 0.50', () => {
    expect(defaultBalanceConfig.marketPriceBands.lemons).toEqual({ min: 0.20, max: 0.50 })
  })

  it('generates rainy WTP values in the expected range (base 1.55 + variance 0.55)', () => {
    // WTP = baseWillingnessToPay + roll * willingnessVariance
    // roll is [0, 1), so range is [1.55, 1.55 + 0.55) = [1.55, 2.10)
    const { baseWillingnessToPay, willingnessVariance } = defaultBalanceConfig.weatherProfiles.raining
    const minWtp = baseWillingnessToPay
    const maxWtp = baseWillingnessToPay + willingnessVariance

    expect(minWtp).toBeCloseTo(1.55, 2)
    expect(maxWtp).toBeCloseTo(2.10, 2)
  })

  it('generates cloudy WTP values in the expected range (base 1.80 + variance 0.75)', () => {
    const { baseWillingnessToPay, willingnessVariance } = defaultBalanceConfig.weatherProfiles.cloudy
    const minWtp = baseWillingnessToPay
    const maxWtp = baseWillingnessToPay + willingnessVariance

    expect(minWtp).toBeCloseTo(1.80, 2)
    expect(maxWtp).toBeCloseTo(2.55, 2)
  })

  it('produces a viable profit margin for ideal rainy recipe at new cost bands', () => {
    // Ideal rainy recipe: 3L/3S/0I
    // Cost per cup at max prices: 3*0.50 + 3*0.28 + 0 = $2.34
    // Cost per cup at min prices: 3*0.20 + 3*0.12 + 0 = $0.96
    // WTP range: [1.55, 2.10)
    // Margin at min cost, min WTP: 1.55 - 0.96 = $0.59
    // Margin at max cost, min WTP: 1.55 - 2.34 = -$0.79 (bad market day)
    // Margin at mid cost: mid lemon = 0.35, mid sugar = 0.20
    //   cost = 3*0.35 + 3*0.20 = $1.65, margin = 1.55 - 1.65 = -$0.10
    // At mid WTP (1.825): margin = 1.825 - 1.65 = $0.175
    // The point is that at favorable cost bands there IS a viable margin
    const lemonMin = defaultBalanceConfig.marketPriceBands.lemons.min
    const sugarMin = defaultBalanceConfig.marketPriceBands.sugar.min
    const minCostPerCup = 3 * lemonMin + 3 * sugarMin
    const rainyMinWtp = defaultBalanceConfig.weatherProfiles.raining.baseWillingnessToPay

    // At minimum ingredient costs, rainy WTP floor provides positive margin
    expect(rainyMinWtp - minCostPerCup).toBeGreaterThan(0.30)
    expect(rainyMinWtp - minCostPerCup).toBeLessThan(0.80)
  })

  it('keeps sugar price band unchanged', () => {
    expect(defaultBalanceConfig.marketPriceBands.sugar).toEqual({ min: 0.12, max: 0.28 })
  })

  it('keeps ice price band unchanged', () => {
    expect(defaultBalanceConfig.marketPriceBands.ice).toEqual({ min: 0.05, max: 0.14 })
  })
})

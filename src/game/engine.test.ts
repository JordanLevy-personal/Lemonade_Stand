import { describe, expect, it } from 'vitest'

import { defaultBalanceConfig } from './balance'
import {
  beginNextDay,
  calculateStandScore,
  createRoom,
  customerCountForWeather,
  enterResultsPhase,
  joinRoom,
  roomCanStartSimulation,
  setPlayerReady,
  startSimulation,
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

  it('derives weather customer pools from the balance config', () => {
    expect(customerCountForWeather('hot')).toBe(50)
    expect(customerCountForWeather('raining')).toBe(15)
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
      }
      room = updatePlayerPlan(room, 'player-host', {
        price: 1.45,
        recipe: {
          lemons: 0,
          sugar: 0,
          ice: 0,
        },
      })
      room = updatePlayerPlan(room, 'player-guest', {
        price: 1.5,
        recipe: {
          lemons: 0,
          sugar: 0,
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
      seed: 17,
    }, persistentBalance)
    const second = createRoom({
      roomId: 'ROOM-A',
      hostPlayerId: 'player-host',
      hostPlayerName: 'Alex',
      hostSessionId: 'session-host',
      seed: 17,
    }, persistentBalance)
    const third = createRoom({
      roomId: 'ROOM-A',
      hostPlayerId: 'player-host',
      hostPlayerName: 'Alex',
      hostSessionId: 'session-host',
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

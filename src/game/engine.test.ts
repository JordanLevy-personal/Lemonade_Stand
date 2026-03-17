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

import { describe, expect, it } from 'vitest'

import {
  applyEvening,
  buyIngredients,
  calculateSellableCups,
  createNewGame,
  loadGame,
  refreshMorningMarket,
  resolveDay,
  saveGame,
  setStrategy,
} from './engine'
import type { DailyMarket, GameState, Inventory, Recipe } from './types'

const TEST_MARKET: DailyMarket = {
  lemons: 0.5,
  sugar: 0.2,
  ice: 0.1,
}

function prepareState(partial: Partial<GameState> = {}): GameState {
  const base = createNewGame({ seed: 12345 })
  return refreshMorningMarket({
    ...base,
    money: partial.money ?? 200,
    ...partial,
    inventory: {
      ...base.inventory,
      ...partial.inventory,
    },
    market: partial.market ?? TEST_MARKET,
    plan: {
      ...base.plan,
      ...partial.plan,
    },
    activeCards: partial.activeCards ?? base.activeCards,
    draftOptions: partial.draftOptions ?? base.draftOptions,
    lastReport: partial.lastReport ?? base.lastReport,
    previousRecipe: partial.previousRecipe ?? base.previousRecipe,
    history: partial.history ?? base.history,
    rng: partial.rng ?? base.rng,
  })
}

function runToEvening(
  state: GameState,
  purchases: Inventory,
  recipe: Recipe,
  price: number,
): GameState {
  return applyEvening(
    resolveDay(
      setStrategy(
        buyIngredients(state, purchases),
        {
          recipe,
          price,
        },
      ),
    ),
  )
}

function runToDay(
  state: GameState,
  purchases: Inventory,
  recipe: Recipe,
  price: number,
): GameState {
  return resolveDay(
    setStrategy(
      buyIngredients(state, purchases),
      {
        recipe,
        price,
      },
    ),
  )
}

describe('engine', () => {
  it('creates a new game with defaults and round-trips through save/load', () => {
    const state = createNewGame({ seed: 77 })

    expect(state.phase).toBe('morning')
    expect(state.day).toBe(1)
    expect(state.money).toBe(20)
    expect(state.rent).toBe(15)
    expect(state.rentTimer).toBe(5)
    expect(state.reputation).toBe(50)
    expect(state.weather).toBeDefined()
    expect(state.market).toBeDefined()

    const reloaded = loadGame(saveGame(state))

    expect(reloaded).toEqual(state)
  })

  it('buys ingredients using the daily market prices', () => {
    const state = prepareState({
      money: 20,
      market: {
        lemons: 1,
        sugar: 1.5,
        ice: 0.25,
      },
    })

    const next = buyIngredients(state, {
      lemons: 2,
      sugar: 1,
      ice: 4,
    })

    expect(next.inventory).toEqual({
      lemons: 2,
      sugar: 1,
      ice: 4,
    })
    expect(next.money).toBe(15.5)
  })

  it('calculates sellable cups from inventory while ignoring zero-ingredient recipe slots', () => {
    expect(
      calculateSellableCups(
        {
          lemons: 8,
          sugar: 1,
          ice: 12,
        },
        {
          lemons: 2,
          sugar: 0,
          ice: 4,
        },
      ),
    ).toBe(3)
  })

  it('rewards weather-matching recipes with better satisfaction and reputation', () => {
    const matchingState = runToEvening(
      prepareState({
        weather: 'hot',
      }),
      {
        lemons: 30,
        sugar: 30,
        ice: 40,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 4,
      },
      1.5,
    )

    const mismatchState = runToEvening(
      prepareState({
        weather: 'hot',
      }),
      {
        lemons: 30,
        sugar: 30,
        ice: 40,
      },
      {
        lemons: 5,
        sugar: 0,
        ice: 0,
      },
      1.5,
    )

    expect(matchingState.lastReport?.averageSatisfaction ?? 0).toBeGreaterThan(
      mismatchState.lastReport?.averageSatisfaction ?? 0,
    )
    expect(matchingState.reputation).toBeGreaterThan(mismatchState.reputation)
  })

  it('melts remaining ice while preserving leftover lemons and sugar', () => {
    const state = runToEvening(
      prepareState({
        weather: 'raining',
        reputation: 25,
      }),
      {
        lemons: 20,
        sugar: 20,
        ice: 20,
      },
      {
        lemons: 1,
        sugar: 1,
        ice: 1,
      },
      1.2,
    )

    expect(state.inventory.ice).toBe(0)
    expect(state.inventory.lemons).toBeGreaterThan(0)
    expect(state.inventory.sugar).toBeGreaterThan(0)
  })

  it('charges rent when the timer reaches zero and increases the next rent exponentially', () => {
    const state = runToEvening(
      prepareState({
        money: 40,
        rent: 15,
        rentTimer: 1,
        weather: 'cloudy',
      }),
      {
        lemons: 10,
        sugar: 10,
        ice: 10,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 1,
      },
      1.3,
    )

    expect(state.lastReport?.rentTriggered).toBe(true)
    expect(state.lastReport?.rentPaid).toBe(15)
    expect(state.rent).toBe(23)
    expect(state.rentTimer).toBe(5)
    expect(state.phase).toBe('evening')
  })

  it('ends the run if money goes negative when rent is due', () => {
    const state = runToEvening(
      prepareState({
        money: 5,
        rent: 15,
        rentTimer: 1,
        weather: 'raining',
      }),
      {
        lemons: 0,
        sugar: 0,
        ice: 0,
      },
      {
        lemons: 1,
        sugar: 1,
        ice: 0,
      },
      5,
    )

    expect(state.phase).toBe('gameOver')
    expect(state.money).toBeLessThan(0)
    expect(state.lastReport?.rentTriggered).toBe(true)
  })

  it('resolves deterministically from the same seed and decisions', () => {
    const first = runToEvening(
      createNewGame({ seed: 501 }),
      {
        lemons: 24,
        sugar: 24,
        ice: 24,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      1.4,
    )

    const second = runToEvening(
      createNewGame({ seed: 501 }),
      {
        lemons: 24,
        sugar: 24,
        ice: 24,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      1.4,
    )

    expect(second.lastReport).toEqual(first.lastReport)
    expect(second.money).toBe(first.money)
    expect(second.reputation).toBe(first.reputation)
    expect(second.inventory).toEqual(first.inventory)
    expect(second.rng).toEqual(first.rng)
  })

  it('records one customer visit per potential customer in the pending day report', () => {
    const state = runToDay(
      prepareState({
        weather: 'sunny',
        reputation: 58,
      }),
      {
        lemons: 24,
        sugar: 24,
        ice: 24,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      1.4,
    )

    expect(state.phase).toBe('day')
    expect(state.pendingReport?.customerVisits).toHaveLength(state.pendingReport?.potentialCustomers ?? 0)
  })

  it('creates deterministic, ordered arrival progress for customer visits', () => {
    const first = runToDay(
      createNewGame({ seed: 321 }),
      {
        lemons: 20,
        sugar: 20,
        ice: 20,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      1.5,
    )
    const second = runToDay(
      createNewGame({ seed: 321 }),
      {
        lemons: 20,
        sugar: 20,
        ice: 20,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      1.5,
    )

    const arrivals = first.pendingReport?.customerVisits.map((visit) => visit.arrivalProgress) ?? []

    expect(second.pendingReport?.customerVisits).toEqual(first.pendingReport?.customerVisits)
    expect(arrivals.every((arrival) => arrival >= 0 && arrival <= 1)).toBe(true)
    expect(arrivals.every((arrival, index) => index === 0 || arrival >= arrivals[index - 1])).toBe(true)
  })

  it('keeps customer visit outcomes aligned with the aggregate report totals', () => {
    const state = runToDay(
      prepareState({
        weather: 'hot',
        reputation: 62,
      }),
      {
        lemons: 6,
        sugar: 6,
        ice: 6,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      1.1,
    )

    const visits = state.pendingReport?.customerVisits ?? []
    const bought = visits.filter((visit) => visit.outcome === 'buy')
    const soldOut = visits.filter((visit) => visit.outcome === 'soldOut')
    const skipped = visits.filter((visit) => visit.outcome === 'skip')

    expect(bought).toHaveLength(state.pendingReport?.cupsSold ?? 0)
    expect(soldOut).toHaveLength(state.pendingReport?.turnedAway ?? 0)
    expect(skipped).toHaveLength(
      (state.pendingReport?.potentialCustomers ?? 0) - (state.pendingReport?.cupsSold ?? 0) - (state.pendingReport?.turnedAway ?? 0),
    )
  })
})

import { describe, expect, it } from 'vitest'

import {
  applyEvening,
  buyIngredients,
  createNewGame,
  generateDraft,
  pickCard,
  refreshMorningMarket,
  resolveDay,
  setStrategy,
} from './engine'
import type { ActiveCard, DailyMarket, GameState, Inventory, Recipe } from './types'

const TEST_MARKET: DailyMarket = {
  lemons: 0.5,
  sugar: 0.2,
  ice: 0.1,
}

function activeCard(id: ActiveCard['id'], remainingDays?: number): ActiveCard {
  return {
    id,
    draftedOnDay: 1,
    remainingDays,
  }
}

function prepareState(partial: Partial<GameState> = {}): GameState {
  const base = createNewGame({ seed: 9001 })
  return refreshMorningMarket({
    ...base,
    money: partial.money ?? 200,
    ...partial,
    market: partial.market ?? TEST_MARKET,
    inventory: {
      ...base.inventory,
      ...partial.inventory,
    },
    plan: {
      ...base.plan,
      ...partial.plan,
    },
    activeCards: partial.activeCards ?? base.activeCards,
    draftOptions: partial.draftOptions ?? base.draftOptions,
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

describe('card hooks', () => {
  it('Loss Leader multiplies positive reputation gains when pricing at or below cost', () => {
    const baseline = runToEvening(
      prepareState({
        weather: 'sunny',
      }),
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
      0.7,
    )

    const withCard = runToEvening(
      prepareState({
        weather: 'sunny',
        activeCards: [activeCard('lossLeader')],
      }),
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
      0.7,
    )

    expect(withCard.lastReport?.reputationChange ?? 0).toBeGreaterThan(
      baseline.lastReport?.reputationChange ?? 0,
    )
  })

  it('Free Samples gives away the first ten cups for free at maximum satisfaction', () => {
    const state = runToEvening(
      prepareState({
        weather: 'hot',
        reputation: 70,
        activeCards: [activeCard('freeSamples')],
      }),
      {
        lemons: 40,
        sugar: 40,
        ice: 50,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 4,
      },
      2,
    )

    expect(state.lastReport?.freeSales).toBe(10)
    expect(state.lastReport?.averageSatisfaction ?? 0).toBeGreaterThan(0.7)
  })

  it('PR Campaign prevents reputation loss from a bad day for its duration and then expires', () => {
    const state = runToEvening(
      prepareState({
        weather: 'raining',
        reputation: 55,
        activeCards: [activeCard('prCampaign', 1)],
      }),
      {
        lemons: 20,
        sugar: 20,
        ice: 0,
      },
      {
        lemons: 0,
        sugar: 0,
        ice: 0,
      },
      4,
    )

    expect(state.reputation).toBeGreaterThanOrEqual(55)
    expect(state.activeCards).toEqual([])
  })

  it('Brand Premium converts more high-price customers and burns reputation on premium sales', () => {
    const baseline = runToEvening(
      prepareState({
        weather: 'sunny',
        reputation: 60,
      }),
      {
        lemons: 60,
        sugar: 60,
        ice: 60,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      4.2,
    )

    const withCard = runToEvening(
      prepareState({
        weather: 'sunny',
        reputation: 60,
        activeCards: [activeCard('brandPremium')],
      }),
      {
        lemons: 60,
        sugar: 60,
        ice: 60,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      4.2,
    )

    expect(withCard.lastReport?.cupsSold ?? 0).toBeGreaterThan(baseline.lastReport?.cupsSold ?? 0)
    expect(withCard.reputation).toBeLessThan(baseline.reputation)
  })

  it('Merchandising pays out 10 percent of reputation during evening', () => {
    const state = runToEvening(
      prepareState({
        weather: 'cloudy',
        reputation: 68,
        activeCards: [activeCard('merchandising')],
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
      1.2,
    )

    expect(state.lastReport?.notes).toContain('Merchandising earned $6.80.')
  })

  it('Franchise Fee resolves instantly on draft', () => {
    const morning = prepareState({
      phase: 'night',
      reputation: 60,
      money: 10,
      draftOptions: ['franchiseFee', 'lossLeader', 'merchandising'],
    })

    const next = pickCard(morning, 'franchiseFee')

    expect(next.reputation).toBe(30)
    expect(next.money).toBe(160)
    expect(next.phase).toBe('morning')
  })

  it('Punch Cards makes every fifth customer free and enforces a reputation floor of 20', () => {
    const state = runToEvening(
      prepareState({
        weather: 'hot',
        reputation: 22,
        activeCards: [activeCard('punchCards')],
      }),
      {
        lemons: 40,
        sugar: 40,
        ice: 40,
      },
      {
        lemons: 0,
        sugar: 0,
        ice: 0,
      },
      4,
    )

    expect(state.lastReport?.freeSales ?? 0).toBeGreaterThanOrEqual(1)
    expect(state.reputation).toBeGreaterThanOrEqual(20)
  })

  it('The Regulars adds five guaranteed sales that do not affect satisfaction', () => {
    const baseline = runToEvening(
      prepareState({
        weather: 'raining',
        reputation: 20,
      }),
      {
        lemons: 20,
        sugar: 20,
        ice: 10,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 0,
      },
      3,
    )

    const withCard = runToEvening(
      prepareState({
        weather: 'raining',
        reputation: 20,
        activeCards: [activeCard('theRegulars')],
      }),
      {
        lemons: 20,
        sugar: 20,
        ice: 10,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 0,
      },
      3,
    )

    expect(withCard.lastReport?.regularSales).toBe(5)
    expect(withCard.lastReport?.cupsSold ?? 0).toBeGreaterThan(baseline.lastReport?.cupsSold ?? 0)
  })

  it('Trend Chasers doubles demand and decays reputation if the recipe was not changed', () => {
    const baseline = runToEvening(
      prepareState({
        weather: 'sunny',
        reputation: 60,
        previousRecipe: {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
      }),
      {
        lemons: 30,
        sugar: 30,
        ice: 30,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      1.4,
    )

    const withCard = runToEvening(
      prepareState({
        weather: 'sunny',
        reputation: 60,
        previousRecipe: {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
        activeCards: [activeCard('trendChasers')],
      }),
      {
        lemons: 60,
        sugar: 60,
        ice: 60,
      },
      {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      1.4,
    )

    expect(withCard.lastReport?.potentialCustomers ?? 0).toBeGreaterThan(
      baseline.lastReport?.potentialCustomers ?? 0,
    )
    expect(withCard.reputation).toBeLessThan(baseline.reputation)
  })

  it('Organic Sourcing increases lemon prices and rewards rich lemon recipes', () => {
    const state = prepareState({
      weather: 'cloudy',
      activeCards: [activeCard('organicSourcing')],
    })

    expect(state.market?.lemons).toBe(TEST_MARKET.lemons * 2)

    const baseline = runToEvening(
      prepareState({
        weather: 'cloudy',
      }),
      {
        lemons: 40,
        sugar: 40,
        ice: 20,
      },
      {
        lemons: 4,
        sugar: 2,
        ice: 1,
      },
      1.8,
    )

    const withCard = runToEvening(
      state,
      {
        lemons: 40,
        sugar: 40,
        ice: 20,
      },
      {
        lemons: 4,
        sugar: 2,
        ice: 1,
      },
      1.8,
    )

    expect(withCard.lastReport?.averageSatisfaction ?? 0).toBeGreaterThan(
      baseline.lastReport?.averageSatisfaction ?? 0,
    )
  })

  it('High Fructose Corn Syrup discounts sugar and can trigger a News Expose', () => {
    const cardState = prepareState({
      weather: 'cloudy',
      reputation: 80,
      activeCards: [activeCard('highFructoseCornSyrup')],
    })

    expect(cardState.market?.sugar).toBeCloseTo(TEST_MARKET.sugar * 0.2, 5)

    let exposedState: GameState | null = null

    for (let seed = 1; seed < 500 && exposedState === null; seed += 1) {
      const result = runToEvening(
        prepareState({
          weather: 'cloudy',
          reputation: 80,
          rng: { seed },
          activeCards: [activeCard('highFructoseCornSyrup')],
        }),
        {
          lemons: 20,
          sugar: 20,
          ice: 10,
        },
        {
          lemons: 2,
          sugar: 2,
          ice: 1,
        },
        1.3,
      )

      if (result.lastReport?.notes.some((note) => note.includes('News Expose'))) {
        exposedState = result
      }
    }

    expect(exposedState).not.toBeNull()
    expect(exposedState?.reputation).toBeLessThan(80)
  })

  it('temporary cards can reappear in a later draft after expiring', () => {
    const dayResult = runToEvening(
      prepareState({
        weather: 'cloudy',
        activeCards: [activeCard('prCampaign', 1)],
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
      1.2,
    )

    const withDraft = generateDraft({
      ...dayResult,
      phase: 'night',
    })

    expect(dayResult.activeCards).toEqual([])
    expect(withDraft.draftOptions.length).toBe(3)
    expect(new Set(withDraft.draftOptions).size).toBe(3)
  })
})

import { defaultBalanceConfig } from './balance'
import type {
  CardDefinition,
  CardId,
  EveningContext,
  GameState,
  MorningContext,
  PriceToleranceContext,
  SatisfactionContext,
} from './types'

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100
}

function applyTemporaryCard(state: GameState, id: CardId, durationDays: number): GameState {
  return {
    ...state,
    activeCards: [
      ...state.activeCards,
      {
        id,
        draftedOnDay: state.day,
        remainingDays: durationDays,
      },
    ],
  }
}

function keepWithinZeroOne(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function organicRecipeBoost(recipeLemons: number): boolean {
  return recipeLemons > 3
}

function withMoneyAndReputation(
  state: GameState,
  money: number,
  reputation: number,
): GameState {
  return {
    ...state,
    money: roundMoney(money),
    reputation: Math.round(reputation),
  }
}

function protectAgainstSatisfactionLoss(context: EveningContext): EveningContext {
  if (context.satisfactionReputationDelta < 0) {
    return {
      ...context,
      satisfactionReputationDelta: 0,
      report: {
        ...context.report,
        notes: [...context.report.notes, 'PR Campaign absorbed the bad buzz.'],
      },
    }
  }

  return context
}

function multiplySatisfaction(
  context: SatisfactionContext,
  multiplier: number,
): SatisfactionContext {
  return {
    ...context,
    satisfaction: keepWithinZeroOne(context.satisfaction * multiplier),
  }
}

function increaseTolerance(
  context: PriceToleranceContext,
  multiplier: number,
): PriceToleranceContext {
  return {
    ...context,
    priceTolerance: context.priceTolerance * multiplier,
  }
}

export const allCards: CardDefinition[] = [
  {
    id: 'lossLeader',
    name: 'Loss Leader',
    description: 'Triple reputation gains when your price is at or below ingredient cost.',
    category: 'investment',
    cost: defaultBalanceConfig.cardCosts.lossLeader,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      onEvening: (context) => {
        if (
          context.report.pricePerCup <= context.report.ingredientCostPerCup &&
          context.satisfactionReputationDelta > 0
        ) {
          return {
            ...context,
            satisfactionReputationDelta: context.satisfactionReputationDelta * 3,
          }
        }

        return context
      },
    },
  },
  {
    id: 'freeSamples',
    name: 'Free Samples',
    description: 'The first 10 customers buy for free and leave fully delighted.',
    category: 'investment',
    cost: defaultBalanceConfig.cardCosts.freeSamples,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      beforeCustomer: (context) => {
        if (context.customerIndex < 10) {
          return {
            ...context,
            forcePurchase: true,
            saleIsFree: true,
            maxSatisfaction: true,
          }
        }

        return context
      },
    },
  },
  {
    id: 'prCampaign',
    name: 'PR Campaign',
    description: 'For 3 days, bad satisfaction cannot lower your reputation.',
    category: 'investment',
    cost: defaultBalanceConfig.cardCosts.prCampaign,
    effectType: 'temporary',
    availability: 'repeatable',
    durationDays: 3,
    hooks: {
      onDraft: ({ state }) => applyTemporaryCard(state, 'prCampaign', 3),
      onEvening: protectAgainstSatisfactionLoss,
    },
  },
  {
    id: 'brandPremium',
    name: 'Brand Premium',
    description: 'Sell above your normal tolerance, but premium sales cost reputation.',
    category: 'harvest',
    cost: defaultBalanceConfig.cardCosts.brandPremium,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      modifyPriceTolerance: (context) => increaseTolerance(context, 1.5),
      afterSale: (context) => {
        if (context.salePrice > context.basePriceTolerance) {
          return {
            ...context,
            premiumSale: true,
            reputationAdjustment: context.reputationAdjustment - 2,
          }
        }

        return context
      },
    },
  },
  {
    id: 'merchandising',
    name: 'Merchandising',
    description: 'Earn evening money equal to 10% of your current reputation.',
    category: 'harvest',
    cost: defaultBalanceConfig.cardCosts.merchandising,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      onEvening: (context) => {
        const payout = roundMoney(context.state.reputation * 0.1)
        return {
          ...context,
          moneyAdjustment: context.moneyAdjustment + payout,
          report: {
            ...context.report,
            notes: [...context.report.notes, `Merchandising earned $${payout.toFixed(2)}.`],
          },
        }
      },
    },
  },
  {
    id: 'franchiseFee',
    name: 'Franchise Fee',
    description: 'Instantly convert half your reputation into a pile of cash.',
    category: 'harvest',
    cost: defaultBalanceConfig.cardCosts.franchiseFee,
    effectType: 'instant',
    availability: 'repeatable',
    hooks: {
      onDraft: ({ state }) => {
        const reputationLoss = Math.round(state.reputation * 0.5)
        const nextReputation = state.reputation - reputationLoss
        const cashGain = reputationLoss * 5

        return withMoneyAndReputation(state, state.money + cashGain, nextReputation)
      },
    },
  },
  {
    id: 'punchCards',
    name: 'Punch Cards',
    description: 'Every 5th customer gets a free cup and your reputation cannot drop below 20.',
    category: 'loyalty',
    cost: defaultBalanceConfig.cardCosts.punchCards,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      beforeCustomer: (context) => {
        if ((context.customerIndex + 1) % 5 === 0) {
          return {
            ...context,
            saleIsFree: true,
          }
        }

        return context
      },
      onReputationClamp: (context) => ({
        ...context,
        minimum: Math.max(context.minimum, 20),
      }),
    },
  },
  {
    id: 'theRegulars',
    name: 'The Regulars',
    description: 'Add 5 guaranteed customers each day, but they do not affect satisfaction.',
    category: 'loyalty',
    cost: defaultBalanceConfig.cardCosts.theRegulars,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      modifyDemand: (context) => ({
        ...context,
        demand: context.demand + 5,
      }),
      beforeCustomer: (context) => {
        if (context.customerIndex < 5) {
          return {
            ...context,
            forcePurchase: true,
            ignoreSatisfaction: true,
            regularSale: true,
          }
        }

        return context
      },
    },
  },
  {
    id: 'trendChasers',
    name: 'Trend Chasers',
    description: 'Double demand, but repeating yesterday’s recipe costs 15% reputation.',
    category: 'loyalty',
    cost: defaultBalanceConfig.cardCosts.trendChasers,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      modifyDemand: (context) => ({
        ...context,
        demand: context.demand * 2,
      }),
      onEvening: (context) => {
        const previousRecipe = context.state.previousRecipe
        const currentRecipe = context.state.plan.recipe

        if (
          previousRecipe !== null &&
          previousRecipe.lemons === currentRecipe.lemons &&
          previousRecipe.sugar === currentRecipe.sugar &&
          previousRecipe.ice === currentRecipe.ice
        ) {
          const decay = Math.round(context.state.reputation * 0.15)
          return {
            ...context,
            reputationAdjustment: context.reputationAdjustment - decay,
            report: {
              ...context.report,
              notes: [...context.report.notes, `Trend Chasers cooled off and cost ${decay} reputation.`],
            },
          }
        }

        return context
      },
    },
  },
  {
    id: 'organicSourcing',
    name: 'Organic Sourcing',
    description: 'Lemons cost double, but lemon-heavy recipes raise tolerance and satisfaction.',
    category: 'recipe',
    cost: defaultBalanceConfig.cardCosts.organicSourcing,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      onMorning: (context: MorningContext) => ({
        ...context,
        market: {
          ...context.market,
          lemons: roundMoney(context.market.lemons * 2),
        },
      }),
      modifyPriceTolerance: (context) => {
        if (organicRecipeBoost(context.state.plan.recipe.lemons)) {
          return increaseTolerance(context, 1.2)
        }

        return context
      },
      modifySatisfaction: (context) => {
        if (organicRecipeBoost(context.state.plan.recipe.lemons)) {
          return multiplySatisfaction(context, 2)
        }

        return context
      },
    },
  },
  {
    id: 'highFructoseCornSyrup',
    name: 'High Fructose Corn Syrup',
    description: 'Sugar gets cheap, but there is a 5% nightly chance of a reputation crash.',
    category: 'recipe',
    cost: defaultBalanceConfig.cardCosts.highFructoseCornSyrup,
    effectType: 'permanent',
    availability: 'unique',
    hooks: {
      onMorning: (context) => ({
        ...context,
        market: {
          ...context.market,
          sugar: roundMoney(context.market.sugar * 0.2),
        },
      }),
      onEvening: (context) => {
        const exposeRoll = context.state.rng.seed % 20 === 0

        if (exposeRoll) {
          return {
            ...context,
            reputationAdjustment: context.reputationAdjustment - 30,
            report: {
              ...context.report,
              notes: [...context.report.notes, 'News Expose hit: -30 reputation.'],
            },
          }
        }

        return context
      },
    },
  },
]

export const cardCatalog = Object.fromEntries(allCards.map((card) => [card.id, card])) as Record<
  CardId,
  CardDefinition
>

export function getCardDefinition(id: CardId): CardDefinition {
  return cardCatalog[id]
}

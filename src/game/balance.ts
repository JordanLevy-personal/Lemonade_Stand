import type { BalanceConfig } from './types'

export const defaultBalanceConfig: BalanceConfig = {
  startingMoney: 20,
  startingRent: 15,
  rentInterval: 5,
  rentGrowthMultiplier: 1.5,
  startingReputation: 50,
  reputationMin: 0,
  reputationMax: 100,
  defaultRecipe: {
    lemons: 2,
    sugar: 2,
    ice: 2,
  },
  defaultPrice: 1.5,
  weatherProfiles: {
    sunny: {
      label: 'Sunny',
      baseDemand: 22,
      toleranceBonus: 0.1,
      idealRecipe: {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
    },
    hot: {
      label: 'Hot',
      baseDemand: 28,
      toleranceBonus: 0.2,
      idealRecipe: {
        lemons: 2,
        sugar: 2,
        ice: 4,
      },
    },
    cloudy: {
      label: 'Cloudy',
      baseDemand: 16,
      toleranceBonus: 0,
      idealRecipe: {
        lemons: 3,
        sugar: 2,
        ice: 1,
      },
    },
    raining: {
      label: 'Raining',
      baseDemand: 10,
      toleranceBonus: -0.1,
      idealRecipe: {
        lemons: 3,
        sugar: 3,
        ice: 0,
      },
    },
  },
  marketPriceBands: {
    lemons: {
      min: 0.3,
      max: 0.65,
    },
    sugar: {
      min: 0.12,
      max: 0.28,
    },
    ice: {
      min: 0.05,
      max: 0.14,
    },
  },
  cardCosts: {
    lossLeader: 3,
    freeSamples: 5,
    prCampaign: 4,
    brandPremium: 4,
    merchandising: 6,
    franchiseFee: 0,
    punchCards: 4,
    theRegulars: 5,
    trendChasers: 4,
    organicSourcing: 3,
    highFructoseCornSyrup: 2,
  },
}

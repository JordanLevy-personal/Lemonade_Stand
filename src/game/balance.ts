import type { BalanceConfig } from './types'

export const defaultBalanceConfig: BalanceConfig = {
  startingMoney: 20,
  startingReputation: 50,
  defaultRecipe: {
    lemons: 2,
    sugar: 2,
    ice: 2,
  },
  defaultPrice: 1.5,
  recipeFeedbackHintUpgradeCost: 25,
  marketEspionageUpgradeCost: 15,
  customerTastePreferenceWeight: 0.35,
  maxPlayers: 2,
  reputationMin: 0,
  reputationMax: 100,
  simulationDurationMs: 28_000,
  weatherProfiles: {
    sunny: {
      label: 'Sunny',
      customerCount: 30,
      idealRecipe: {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      baseWillingnessToPay: 1.9,
      willingnessVariance: 0.9,
    },
    hot: {
      label: 'Hot',
      customerCount: 50,
      idealRecipe: {
        lemons: 2,
        sugar: 2,
        ice: 4,
      },
      baseWillingnessToPay: 2,
      willingnessVariance: 1.1,
    },
    cloudy: {
      label: 'Cloudy',
      customerCount: 24,
      idealRecipe: {
        lemons: 3,
        sugar: 2,
        ice: 1,
      },
      baseWillingnessToPay: 1.80,
      willingnessVariance: 0.75,
    },
    raining: {
      label: 'Raining',
      customerCount: 15,
      idealRecipe: {
        lemons: 3,
        sugar: 3,
        ice: 0,
      },
      baseWillingnessToPay: 1.55,
      willingnessVariance: 0.55,
    },
  },
  marketPriceBands: {
    lemons: {
      min: 0.20,
      max: 0.50,
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
  factions: [
    {
      id: 'sun-guild',
      name: 'Sun Guild',
      accent: '#f3b63f',
      banner: 'Golden sparkle',
    },
    {
      id: 'market-tide',
      name: 'Market Tide',
      accent: '#4b8e8d',
      banner: 'Teal wave',
    },
  ],
}

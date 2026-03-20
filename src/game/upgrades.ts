import type { BalanceConfig, OwnedUpgrades, RunUpgradeId } from './types'

type UpgradeCostKey = 'recipeFeedbackHintUpgradeCost' | 'marketEspionageUpgradeCost'

interface RunUpgradeDefinition {
  id: RunUpgradeId
  ownershipKey: keyof OwnedUpgrades
  costKey: UpgradeCostKey
}

const RUN_UPGRADE_DEFINITIONS: Record<RunUpgradeId, RunUpgradeDefinition> = {
  'recipe-feedback-hints': {
    id: 'recipe-feedback-hints',
    ownershipKey: 'recipeFeedbackHints',
    costKey: 'recipeFeedbackHintUpgradeCost',
  },
  'market-espionage': {
    id: 'market-espionage',
    ownershipKey: 'marketEspionage',
    costKey: 'marketEspionageUpgradeCost',
  },
}

export function defaultOwnedUpgrades(): OwnedUpgrades {
  return {
    recipeFeedbackHints: false,
    marketEspionage: false,
  }
}

export function getUpgradeOwnershipKey(upgradeId: RunUpgradeId): keyof OwnedUpgrades {
  return RUN_UPGRADE_DEFINITIONS[upgradeId].ownershipKey
}

export function isUpgradeOwned(
  ownedUpgrades: OwnedUpgrades | undefined,
  upgradeId: RunUpgradeId,
): boolean {
  if (ownedUpgrades === undefined) {
    return false
  }

  return ownedUpgrades[getUpgradeOwnershipKey(upgradeId)] === true
}

export function unlockUpgrade(
  ownedUpgrades: OwnedUpgrades | undefined,
  upgradeId: RunUpgradeId,
): OwnedUpgrades {
  return {
    ...defaultOwnedUpgrades(),
    ...ownedUpgrades,
    [getUpgradeOwnershipKey(upgradeId)]: true,
  }
}

export function getUpgradeCost(balance: BalanceConfig, upgradeId: RunUpgradeId): number {
  return balance[RUN_UPGRADE_DEFINITIONS[upgradeId].costKey]
}

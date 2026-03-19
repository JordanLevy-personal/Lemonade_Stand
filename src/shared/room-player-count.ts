export type SupportedGameMode = 'singleplayer' | 'multiplayer'

export const SINGLEPLAYER_TARGET_COUNT = 1
export const MIN_MULTIPLAYER_PLAYER_COUNT = 2
export const MAX_MULTIPLAYER_PLAYER_COUNT = 4
export const SUPPORTED_MULTIPLAYER_PLAYER_COUNTS = Object.freeze(
  Array.from(
    { length: MAX_MULTIPLAYER_PLAYER_COUNT - MIN_MULTIPLAYER_PLAYER_COUNT + 1 },
    (_, index) => MIN_MULTIPLAYER_PLAYER_COUNT + index,
  ),
)
export const DEFAULT_MULTIPLAYER_PLAYER_COUNT = SUPPORTED_MULTIPLAYER_PLAYER_COUNTS[0]

export function validateTargetPlayerCount(
  gameMode: SupportedGameMode,
  targetPlayerCount: number,
): number {
  if (!Number.isInteger(targetPlayerCount)) {
    throw new Error('Player count must be a whole number.')
  }

  if (gameMode === 'singleplayer') {
    if (targetPlayerCount !== SINGLEPLAYER_TARGET_COUNT) {
      throw new Error('Single-player rooms must have exactly 1 player.')
    }

    return SINGLEPLAYER_TARGET_COUNT
  }

  if (
    targetPlayerCount < MIN_MULTIPLAYER_PLAYER_COUNT ||
    targetPlayerCount > MAX_MULTIPLAYER_PLAYER_COUNT
  ) {
    throw new Error('Multiplayer rooms support 2 to 4 players.')
  }

  return targetPlayerCount
}

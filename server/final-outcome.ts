import type { PlayerState, RoomFinalOutcome, RunLengthDays } from './contracts'

function winningPlayersByMoney(players: PlayerState[]): PlayerState[] {
  const highestMoney = Math.max(...players.map((player) => player.money))
  return players.filter((player) => player.money === highestMoney)
}

function winningPlayersByReputation(players: PlayerState[]): PlayerState[] {
  const highestReputation = Math.max(...players.map((player) => player.reputation))
  return players.filter((player) => player.reputation === highestReputation)
}

export function normalizeRunLengthDays(value: number): RunLengthDays {
  return value === 30 ? 30 : 14
}

export function determineFinalOutcome(players: PlayerState[]): RoomFinalOutcome {
  const moneyLeaders = winningPlayersByMoney(players)

  if (moneyLeaders.length === 1) {
    return {
      winnerPlayerIds: [moneyLeaders[0].id],
      decidedBy: 'money',
    }
  }

  const reputationLeaders = winningPlayersByReputation(moneyLeaders)

  if (reputationLeaders.length === 1) {
    return {
      winnerPlayerIds: [reputationLeaders[0].id],
      decidedBy: 'reputation',
    }
  }

  return {
    winnerPlayerIds: reputationLeaders.map((player) => player.id),
    decidedBy: 'draw',
  }
}

// @vitest-environment node

import { describe, expect, it } from 'vitest'

import { createDefaultRoomGameHooks } from './default-game-hooks'
import { RoomManager } from './room-manager'

const HOST_FACTION = {
  id: 'sun-guild',
  name: 'Sun Guild',
  accentColor: '#f3c84b',
}

const GUEST_FACTION = {
  id: 'market-tide',
  name: 'Market Tide',
  accentColor: '#2f8fda',
}

const DEFAULT_PLAN = {
  purchases: {
    lemons: 6,
    sugar: 6,
    ice: 6,
  },
  recipe: {
    lemons: 2,
    sugar: 2,
    ice: 2,
  },
  price: 1.5,
}

describe('default game hooks', () => {
  it('starts a fresh room simulation with a non-empty customer wave', () => {
    const manager = new RoomManager(createDefaultRoomGameHooks(), () => 12_000)

    manager.createRoom({
      roomId: 'ROOM01',
      playerId: 'host-1',
      name: 'Host',
      gameMode: 'multiplayer',
      targetPlayerCount: 2,
      runLengthDays: 14,
      faction: HOST_FACTION,
      analyticsPlayerId: 'analytics-host',
    })
    manager.joinRoom({
      roomId: 'ROOM01',
      name: 'Guest',
      faction: GUEST_FACTION,
      analyticsPlayerId: 'analytics-guest',
    })

    manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'host-1',
      plan: DEFAULT_PLAN,
    })
    const result = manager.submitPlan({
      roomId: 'ROOM01',
      playerId: 'room01-player-2',
      plan: DEFAULT_PLAN,
    })

    expect(result.room.phase).toBe('simulating')
    expect(result.room.simulation?.customerEvents.length).toBeGreaterThan(0)
    expect(result.room.simulation?.customerEvents[0]?.standStops.length).toBeGreaterThan(0)
  })
})

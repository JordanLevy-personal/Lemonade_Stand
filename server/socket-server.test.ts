// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import WebSocket, { type RawData } from 'ws'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLanServer, type LanServerLogger } from './socket-server'

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('open', () => resolve())
    socket.once('error', (error) => reject(error))
  })
}

function waitForMessage(socket: WebSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    socket.once('message', (payload) => resolve(String(payload)))
    socket.once('error', (error) => reject(error))
  })
}

function waitForPing(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once('ping', () => resolve())
    socket.once('error', (error) => reject(error))
  })
}

function waitForMessageCount(socket: WebSocket, count: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const messages: string[] = []

    const onMessage = (payload: RawData) => {
      messages.push(String(payload))

      if (messages.length >= count) {
        socket.off('message', onMessage)
        socket.off('error', onError)
        resolve(messages)
      }
    }
    const onError = (error: Error) => {
      socket.off('message', onMessage)
      socket.off('error', onError)
      reject(error)
    }

    socket.on('message', onMessage)
    socket.on('error', onError)
  })
}

function readAll(databasePath: string, query: string): Record<string, unknown>[] {
  const database = new DatabaseSync(databasePath)

  try {
    return database.prepare(query).all() as Record<string, unknown>[]
  } finally {
    database.close()
  }
}

describe('createLanServer', () => {
  const sockets: WebSocket[] = []
  const servers: Array<{ close: () => Promise<void> }> = []
  const tempDirectories: string[] = []

  afterEach(async () => {
    sockets.forEach((socket) => socket.close())
    sockets.length = 0

    while (servers.length > 0) {
      await servers.pop()?.close()
    }

    while (tempDirectories.length > 0) {
      rmSync(tempDirectories.pop()!, { recursive: true, force: true })
    }
  })

  it('logs socket lifecycle details for room creation and close', async () => {
    const logger: LanServerLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    const server = await createLanServer({
      port: 0,
      logger,
    })
    servers.push(server)

    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`)
    sockets.push(socket)
    await waitForOpen(socket)

    socket.send(
      JSON.stringify({
        type: 'create_room',
        name: 'Alex',
        faction: {
          id: 'sun-guild',
          name: 'Sun Guild',
          accentColor: '#f3b63f',
        },
        analyticsPlayerId: 'analytics-host',
      }),
    )

    const connectedMessage = JSON.parse(await waitForMessage(socket)) as {
      type: string
      roomId: string
      playerId: string
    }

    expect(connectedMessage.type).toBe('connected')
    expect(logger.info).toHaveBeenCalledWith(
      'socket_connected',
      expect.objectContaining({
        clientAddress: expect.any(String),
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'room_created',
      expect.objectContaining({
        roomId: connectedMessage.roomId,
        playerId: connectedMessage.playerId,
        playerName: 'Alex',
      }),
    )

    socket.close(1000, 'test complete')
    await new Promise((resolve) => setTimeout(resolve, 50))

    expect(logger.info).toHaveBeenCalledWith(
      'socket_closed',
      expect.objectContaining({
        roomId: connectedMessage.roomId,
        playerId: connectedMessage.playerId,
        code: 1000,
        reason: 'test complete',
      }),
    )
    expect(logger.info).toHaveBeenCalledWith(
      'player_disconnected',
      expect.objectContaining({
        roomId: connectedMessage.roomId,
        playerId: connectedMessage.playerId,
      }),
    )
  })

  it('sends heartbeat pings to idle sockets', async () => {
    const server = await createLanServer({
      port: 0,
      heartbeatIntervalMs: 20,
    })
    servers.push(server)

    const socket = new WebSocket(`ws://127.0.0.1:${server.port}`)
    sockets.push(socket)
    await waitForOpen(socket)

    await expect(waitForPing(socket)).resolves.toBeUndefined()
  })

  it('persists game, player-day, customer profile, and customer event telemetry after simulation starts', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'socket-server-telemetry-'))
    const databasePath = join(directory, 'playtest.sqlite')
    tempDirectories.push(directory)

    const server = await createLanServer({
      port: 0,
      telemetryDatabasePath: databasePath,
      now: () => 12_000,
    })
    servers.push(server)

    const hostSocket = new WebSocket(`ws://127.0.0.1:${server.port}`)
    const guestSocket = new WebSocket(`ws://127.0.0.1:${server.port}`)
    sockets.push(hostSocket, guestSocket)
    await Promise.all([waitForOpen(hostSocket), waitForOpen(guestSocket)])

    hostSocket.send(
      JSON.stringify({
        type: 'create_room',
        name: 'Alex',
        faction: {
          id: 'sun-guild',
          name: 'Sun Guild',
          accentColor: '#f3b63f',
        },
        analyticsPlayerId: 'analytics-host',
      }),
    )

    const [hostConnectedRaw] = await waitForMessageCount(hostSocket, 1)
    const hostConnected = JSON.parse(hostConnectedRaw) as {
      roomId: string
      playerId: string
      type: string
    }

    guestSocket.send(
      JSON.stringify({
        type: 'join_room',
        roomId: hostConnected.roomId,
        name: 'Blair',
        faction: {
          id: 'market-tide',
          name: 'Market Tide',
          accentColor: '#4b8e8d',
        },
        analyticsPlayerId: 'analytics-guest',
      }),
    )

    const [guestConnectedRaw] = await waitForMessageCount(guestSocket, 1)
    const guestConnected = JSON.parse(guestConnectedRaw) as {
      playerId: string
      type: string
    }

    hostSocket.send(
      JSON.stringify({
        type: 'submit_plan',
        roomId: hostConnected.roomId,
        playerId: hostConnected.playerId,
        plan: {
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
          price: 1.2,
        },
      }),
    )

    guestSocket.send(
      JSON.stringify({
        type: 'submit_plan',
        roomId: hostConnected.roomId,
        playerId: guestConnected.playerId,
        plan: {
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
          price: 1.4,
        },
      }),
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    const games = readAll(databasePath, 'select game_id from games')
    const playerDays = readAll(
      databasePath,
      'select analytics_player_id, player_id, day_number from player_day_records order by analytics_player_id',
    )
    const customerProfiles = readAll(databasePath, 'select count(*) as count from customer_profiles')
    const customerEvents = readAll(databasePath, 'select count(*) as count from customer_events')
    const customerOfferScores = readAll(databasePath, 'select count(*) as count from customer_offer_scores')

    expect(games).toEqual([{ game_id: hostConnected.roomId }])
    expect(playerDays).toHaveLength(2)
    expect(playerDays).toEqual(
      expect.arrayContaining([
        {
          analytics_player_id: 'analytics-host',
          player_id: hostConnected.playerId,
          day_number: 1,
        },
        {
          analytics_player_id: 'analytics-guest',
          player_id: guestConnected.playerId,
          day_number: 1,
        },
      ]),
    )
    expect(Number(customerProfiles[0]?.count ?? 0)).toBeGreaterThan(0)
    expect(Number(customerEvents[0]?.count ?? 0)).toBeGreaterThan(0)
    expect(Number(customerOfferScores[0]?.count ?? 0)).toBeGreaterThan(0)
  })
})

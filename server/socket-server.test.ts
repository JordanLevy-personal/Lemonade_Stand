// @vitest-environment node

import WebSocket from 'ws'
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

describe('createLanServer', () => {
  const sockets: WebSocket[] = []
  const servers: Array<{ close: () => Promise<void> }> = []

  afterEach(async () => {
    sockets.forEach((socket) => socket.close())
    sockets.length = 0

    while (servers.length > 0) {
      await servers.pop()?.close()
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
})

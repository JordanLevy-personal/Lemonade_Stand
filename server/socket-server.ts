import { createServer, type Server as HttpServer } from 'node:http'

import type { ClientMessage, PlayerSession, ServerMessage } from './contracts'
import { createDefaultRoomGameHooks } from './default-game-hooks'
import { RoomManager } from './room-manager'

type WebSocket = import('ws').WebSocket
type WebSocketServer = import('ws').WebSocketServer

interface ClientConnection {
  socket: WebSocket
  session: PlayerSession | null
}

export interface LanServerOptions {
  port?: number
  now?: () => number
}

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message))
}

function parseMessage(rawMessage: string): ClientMessage {
  return JSON.parse(rawMessage) as ClientMessage
}

function roomCode(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export async function createLanServer(
  options: LanServerOptions = {},
): Promise<{
  port: number
  close: () => Promise<void>
  httpServer: HttpServer
}> {
  const { WebSocketServer } = await import('ws')
  const manager = new RoomManager(createDefaultRoomGameHooks(), options.now)
  const connections = new Set<ClientConnection>()
  const roomTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const httpServer = createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ status: 'ok' }))
  })
  const websocketServer: WebSocketServer = new WebSocketServer({ server: httpServer })

  function broadcast(roomId: string, message: ServerMessage): void {
    connections.forEach((connection) => {
      if (connection.session?.roomId === roomId) {
        send(connection.socket, message)
      }
    })
  }

  function broadcastRoomState(roomId: string): void {
    const room = manager.getRoom(roomId)

    if (room !== null) {
      broadcast(roomId, {
        type: 'room_state',
        room,
      })
    }
  }

  function scheduleResults(roomId: string, delayMs: number): void {
    const existingTimer = roomTimers.get(roomId)
    if (existingTimer !== undefined) {
      clearTimeout(existingTimer)
    }

    const timer = setTimeout(() => {
      const room = manager.completeSimulation(roomId)
      roomTimers.delete(roomId)
      broadcastRoomState(room.roomId)
    }, delayMs)

    roomTimers.set(roomId, timer)
  }

  websocketServer.on('connection', (socket) => {
    const connection: ClientConnection = {
      socket,
      session: null,
    }
    connections.add(connection)

    socket.on('message', (payload) => {
      try {
        const message = parseMessage(String(payload))

        if (message.type === 'create_room') {
          const playerId = `${roomCode().toLowerCase()}-host`
          const roomId = roomCode()
          const room = manager.createRoom({
            roomId,
            playerId,
            name: message.name,
            faction: message.faction,
          })

          connection.session = {
            roomId,
            playerId,
          }
          send(socket, {
            type: 'connected',
            roomId,
            playerId,
            hostPlayerId: room.hostPlayerId,
          })
          broadcastRoomState(roomId)
          return
        }

        if (message.type === 'join_room') {
          const room = manager.joinRoom({
            roomId: message.roomId,
            playerId: message.playerId,
            name: message.name,
            faction: message.faction,
          })
          const playerId =
            message.playerId ??
            room.players.find((player) => player.connectionStatus === 'connected' && player.name === message.name)?.id

          if (playerId === undefined) {
            throw new Error('Could not determine player session.')
          }

          connection.session = {
            roomId: room.roomId,
            playerId,
          }
          send(socket, {
            type: 'connected',
            roomId: room.roomId,
            playerId,
            hostPlayerId: room.hostPlayerId,
          })
          broadcastRoomState(room.roomId)
          return
        }

        if (message.type === 'submit_plan') {
          const result = manager.submitPlan({
            roomId: message.roomId,
            playerId: message.playerId,
            plan: message.plan,
          })

          broadcastRoomState(message.roomId)

          if (result.simulationStartedAt !== null) {
            broadcast(message.roomId, {
              type: 'simulation_started',
              room: result.room,
              simulationStartAt: result.simulationStartedAt,
            })
            scheduleResults(
              message.roomId,
              (result.room.simulation?.durationMs ?? 0) + 1_000,
            )
          }

          return
        }

        const room = manager.requestNextDay({
          roomId: message.roomId,
          playerId: message.playerId,
        })
        broadcastRoomState(room.roomId)
      } catch (error) {
        send(socket, {
          type: 'server_error',
          message: error instanceof Error ? error.message : 'Unknown server error.',
        })
      }
    })

    socket.on('close', () => {
      if (connection.session !== null) {
        const room = manager.disconnect(connection.session)
        broadcastRoomState(room.roomId)
      }

      connections.delete(connection)
    })
  })

  await new Promise<void>((resolve) => {
    httpServer.listen(options.port ?? 3001, '0.0.0.0', () => resolve())
  })

  return {
    port: (httpServer.address() as { port: number }).port,
    httpServer,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        roomTimers.forEach((timer) => clearTimeout(timer))
        roomTimers.clear()
        websocketServer.close((error) => {
          if (error) {
            reject(error)
            return
          }

          httpServer.close((httpError) => {
            if (httpError) {
              reject(httpError)
              return
            }

            resolve()
          })
        })
      })
    },
  }
}

import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'

import type { ClientMessage, PlayerSession, ServerMessage } from './contracts'
import { createDefaultRoomGameHooks } from './default-game-hooks'
import { RoomManager } from './room-manager'

type WebSocket = import('ws').WebSocket
type WebSocketServer = import('ws').WebSocketServer

interface ClientConnection {
  socket: WebSocket
  session: PlayerSession | null
  clientAddress: string
  userAgent: string
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000
const OPEN_READY_STATE = 1

export interface LanServerOptions {
  port?: number
  now?: () => number
  logger?: LanServerLogger
  heartbeatIntervalMs?: number
}

export interface LanServerLogger {
  info: (event: string, details: Record<string, unknown>) => void
  warn: (event: string, details: Record<string, unknown>) => void
  error: (event: string, details: Record<string, unknown>) => void
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

function forwardedHeaderValue(request: IncomingMessage, name: string): string | null {
  const value = request.headers[name]

  if (Array.isArray(value)) {
    return value[0] ?? null
  }

  return value ?? null
}

function clientAddress(request: IncomingMessage): string {
  const forwardedFor = forwardedHeaderValue(request, 'x-forwarded-for')

  if (forwardedFor !== null) {
    return forwardedFor.split(',')[0]?.trim() ?? 'unknown'
  }

  return request.socket.remoteAddress ?? 'unknown'
}

function userAgent(request: IncomingMessage): string {
  return forwardedHeaderValue(request, 'user-agent') ?? 'unknown'
}

function defaultLogger(): LanServerLogger {
  return {
    info(event, details) {
      console.info(`[lan-server] ${event}`, details)
    },
    warn(event, details) {
      console.warn(`[lan-server] ${event}`, details)
    },
    error(event, details) {
      console.error(`[lan-server] ${event}`, details)
    },
  }
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
  const logger = options.logger ?? defaultLogger()
  const connections = new Set<ClientConnection>()
  const roomTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const heartbeatInterval = setInterval(() => {
    connections.forEach((connection) => {
      if (connection.socket.readyState === OPEN_READY_STATE) {
        connection.socket.ping()
      }
    })
  }, options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS)
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

  websocketServer.on('connection', (socket, request) => {
    const connection: ClientConnection = {
      socket,
      session: null,
      clientAddress: clientAddress(request),
      userAgent: userAgent(request),
    }
    connections.add(connection)
    logger.info('socket_connected', {
      clientAddress: connection.clientAddress,
      userAgent: connection.userAgent,
    })

    socket.on('message', (payload) => {
      try {
        const message = parseMessage(String(payload))
        logger.info('client_message', {
          clientAddress: connection.clientAddress,
          roomId: 'roomId' in message ? message.roomId : null,
          playerId: 'playerId' in message ? message.playerId ?? null : null,
          type: message.type,
        })

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
          logger.info('room_created', {
            clientAddress: connection.clientAddress,
            playerId,
            playerName: message.name,
            roomId,
          })
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
          logger.info('room_joined', {
            clientAddress: connection.clientAddress,
            playerId,
            playerName: message.name,
            roomId: room.roomId,
          })
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
          logger.info('plan_submitted', {
            clientAddress: connection.clientAddress,
            playerId: message.playerId,
            roomId: message.roomId,
          })

          broadcastRoomState(message.roomId)

          if (result.simulationStartedAt !== null) {
            logger.info('simulation_started', {
              roomId: message.roomId,
              simulationStartAt: result.simulationStartedAt,
            })
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
        logger.info('next_day_requested', {
          clientAddress: connection.clientAddress,
          playerId: message.playerId,
          roomId: message.roomId,
        })
        broadcastRoomState(room.roomId)
      } catch (error) {
        logger.warn('socket_message_failed', {
          clientAddress: connection.clientAddress,
          error: error instanceof Error ? error.message : 'Unknown server error.',
          roomId: connection.session?.roomId ?? null,
          playerId: connection.session?.playerId ?? null,
        })
        send(socket, {
          type: 'server_error',
          message: error instanceof Error ? error.message : 'Unknown server error.',
        })
      }
    })

    socket.on('error', (error) => {
      logger.warn('socket_error', {
        clientAddress: connection.clientAddress,
        error: error.message,
        roomId: connection.session?.roomId ?? null,
        playerId: connection.session?.playerId ?? null,
      })
    })

    socket.on('close', (code, reasonBuffer) => {
      logger.info('socket_closed', {
        clientAddress: connection.clientAddress,
        code,
        playerId: connection.session?.playerId ?? null,
        reason: reasonBuffer.toString(),
        roomId: connection.session?.roomId ?? null,
      })

      if (connection.session !== null) {
        const room = manager.disconnect(connection.session)
        logger.info('player_disconnected', {
          clientAddress: connection.clientAddress,
          playerId: connection.session.playerId,
          roomId: connection.session.roomId,
        })
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
        clearInterval(heartbeatInterval)
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

import { createServer, type IncomingMessage, type Server as HttpServer } from 'node:http'

import { defaultBalanceConfig } from '../src/game/balance'
import type { SimulationTelemetry } from '../src/game/types'
import { isUpgradeOwned } from '../src/game/upgrades'
import type { ClientMessage, PlayerSession, RoomState, ServerMessage } from './contracts'
import { createDefaultRoomGameHooks } from './default-game-hooks'
import { RoomManager } from './room-manager'
import { SqliteTelemetryRepository } from './telemetry-repository'

type WebSocket = import('ws').WebSocket
type WebSocketServer = import('ws').WebSocketServer

interface ClientConnection {
  socket: WebSocket
  session: PlayerSession | null
  clientAddress: string
  userAgent: string
}

const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000
const DEFAULT_TELEMETRY_DATABASE_PATH = './data/playtest-telemetry.sqlite'
const OPEN_READY_STATE = 1

export interface LanServerOptions {
  port?: number
  now?: () => number
  logger?: LanServerLogger
  heartbeatIntervalMs?: number
  telemetryDatabasePath?: string
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

type RoomSimulationEvent = NonNullable<NonNullable<RoomState['simulation']>['customerEvents']>[number]

function projectCustomerEventForViewer(
  room: RoomState,
  viewerPlayerId: string | null,
  event: RoomSimulationEvent,
): RoomSimulationEvent {
  const viewerOwnsHints =
    viewerPlayerId !== null &&
    isUpgradeOwned(
      room.players.find((player) => player.id === viewerPlayerId)?.ownedUpgrades,
      'recipe-feedback-hints',
    )
  const { feedbackHintsByPlayerId, ...publicEvent } = event

  return {
    ...publicEvent,
    recipeFeedbackHint:
      viewerOwnsHints && viewerPlayerId !== null
        ? feedbackHintsByPlayerId?.[viewerPlayerId] ?? null
        : null,
  }
}

function projectHistoryForViewer(
  room: RoomState,
  viewerPlayerId: string | null,
  player: RoomState['players'][number],
): RoomState['players'][number]['history'] {
  if (
    room.gameMode === 'singleplayer' ||
    viewerPlayerId === null ||
    player.id === viewerPlayerId ||
    isUpgradeOwned(
      room.players.find((candidate) => candidate.id === viewerPlayerId)?.ownedUpgrades,
      'market-espionage',
    )
  ) {
    return player.history
  }

  return player.history.map(({ recipeSnapshot: _recipeSnapshot, ...historyEntry }) => historyEntry)
}

function projectRoomForViewer(room: RoomState, viewerPlayerId: string | null): RoomState {
  return {
    ...room,
    players: room.players.map((player) => ({
      ...player,
      history: projectHistoryForViewer(room, viewerPlayerId, player),
    })),
    simulation:
      room.simulation === null
        ? null
        : {
            ...room.simulation,
            customerEvents: room.simulation.customerEvents.map((event) =>
              projectCustomerEventForViewer(room, viewerPlayerId, event),
            ),
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
  const telemetryRepository = new SqliteTelemetryRepository({
    databasePath: options.telemetryDatabasePath ?? DEFAULT_TELEMETRY_DATABASE_PATH,
  })
  telemetryRepository.initialize()
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

  function broadcast(roomId: string, message: Extract<ServerMessage, { type: 'room_state' | 'simulation_started' }>): void {
    connections.forEach((connection) => {
      if (connection.session?.roomId === roomId) {
        send(connection.socket, {
          ...message,
          room: projectRoomForViewer(message.room, connection.session.playerId),
        })
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

  function persistTelemetry(
    event: string,
    roomId: string | null,
    playerId: string | null,
    action: () => void,
  ): void {
    try {
      action()
    } catch (error) {
      logger.warn('telemetry_write_failed', {
        error: error instanceof Error ? error.message : 'Unknown telemetry error.',
        event,
        roomId,
        playerId,
      })
    }
  }

  function persistSubmittedPlan(
    room: ReturnType<RoomManager['getRoom']>,
    playerId: string,
    plan: Extract<ClientMessage, { type: 'submit_plan' }>['plan'],
    submittedAt: string,
  ): void {
    if (room === null) {
      return
    }

    const player = room?.players.find((candidate) => candidate.id === playerId)
    const analyticsPlayerId = manager.getAnalyticsPlayerId(room.roomId, playerId)

    if (room === null || player === undefined || analyticsPlayerId === null) {
      return
    }

    telemetryRepository.upsertPlayerDayPlan({
      gameId: room.roomId,
      dayNumber: room.day,
      playerId,
      analyticsPlayerId,
      gameMode: room.gameMode,
      playerCount: room.targetPlayerCount,
      factionId: player.faction.id,
      weather: room.weather,
      marketBasePrices: room.marketBasePrices,
      moneyBeforePlanning: player.money,
      reputationBeforePlanning: player.reputation,
      inventoryBeforePlanning: player.inventory,
      recipeFeedbackHintsOwnedBeforePlanning: player.ownedUpgrades?.recipeFeedbackHints === true,
      marketEspionageOwnedBeforePlanning: player.ownedUpgrades?.marketEspionage === true,
      purchases: plan.purchases,
      recipe: plan.recipe,
      price: plan.price,
      submittedAt,
    })
    telemetryRepository.touchGameActivity(room.roomId)
  }

  function persistSimulationTelemetry(
    roomId: string,
    telemetry: SimulationTelemetry,
    resolvedAt: string,
  ): void {
    const room = manager.getRoom(roomId)

    if (room === null) {
      return
    }

    telemetryRepository.insertCustomerProfiles({
      gameId: roomId,
      profiles: telemetry.customerProfiles,
    })
    for (const player of room.players) {
      if (player.dailyResults === null) {
        continue
      }

      telemetryRepository.upsertPlayerDayOutcome({
        gameId: roomId,
        dayNumber: room.day,
        playerId: player.id,
        moneyAfterResults: player.money,
        reputationAfterResults: player.reputation,
        inventoryAfterResults: player.inventory,
        recipeFeedbackHintsOwnedAfterResults: player.ownedUpgrades?.recipeFeedbackHints === true,
        marketEspionageOwnedAfterResults: player.ownedUpgrades?.marketEspionage === true,
        cupsSold: player.dailyResults.cupsSold,
        revenue: player.dailyResults.revenue,
        satisfaction: player.dailyResults.satisfaction,
        reputationDelta: player.dailyResults.reputationDelta,
        customersWon: player.dailyResults.customersWon,
        customersSkipped: player.dailyResults.customersSkipped,
        customersSoldOut: player.dailyResults.customersSoldOut,
        resolvedAt,
      })
    }
    telemetryRepository.insertCustomerEvents({
      gameId: roomId,
      dayNumber: room.day,
      events: telemetry.customerEvents,
    })
    telemetryRepository.insertCustomerOfferScores({
      gameId: roomId,
      dayNumber: room.day,
      scores: telemetry.customerOfferScores,
    })
    telemetryRepository.touchGameActivity(roomId)
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
            gameMode: message.gameMode,
            targetPlayerCount: message.targetPlayerCount,
            runLengthDays: message.runLengthDays,
            faction: message.faction,
            analyticsPlayerId: message.analyticsPlayerId,
          })

          persistTelemetry('room_created', roomId, playerId, () => {
            telemetryRepository.upsertGame({
              gameId: roomId,
              roomId,
              rngSeed: room.rngSeed ?? 0,
              gameMode: room.gameMode,
              playerCount: room.targetPlayerCount,
              runLengthDays: room.runLengthDays,
              customerTastePreferenceWeight: defaultBalanceConfig.customerTastePreferenceWeight,
            })
            telemetryRepository.insertCustomerProfiles({
              gameId: roomId,
              profiles: (room.customerRoster ?? []).map((customer) => ({
                customerId: customer.id,
                tasteOffsets: customer.tasteOffsets,
              })),
            })
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
            analyticsPlayerId: message.analyticsPlayerId,
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

        if (message.type === 'purchase_upgrade') {
          const room = manager.purchaseUpgrade({
            roomId: message.roomId,
            playerId: message.playerId,
            upgradeId: message.upgradeId,
          })
          logger.info('upgrade_purchased', {
            clientAddress: connection.clientAddress,
            playerId: message.playerId,
            roomId: message.roomId,
            upgradeId: message.upgradeId,
          })
          persistTelemetry('upgrade_purchased', message.roomId, message.playerId, () => {
            telemetryRepository.touchGameActivity(message.roomId)
          })
          broadcastRoomState(room.roomId)
          return
        }

        if (message.type === 'submit_plan') {
          const roomBeforeSubmit = manager.getRoom(message.roomId)
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
          persistTelemetry('plan_submitted', message.roomId, message.playerId, () => {
            persistSubmittedPlan(roomBeforeSubmit, message.playerId, message.plan, new Date().toISOString())
          })

          broadcastRoomState(message.roomId)

          if (result.simulationStartedAt !== null) {
            persistTelemetry('simulation_started', message.roomId, message.playerId, () => {
              if (result.telemetry !== null) {
                persistSimulationTelemetry(message.roomId, result.telemetry, new Date().toISOString())
              }
            })
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
        persistTelemetry('next_day_requested', message.roomId, message.playerId, () => {
          telemetryRepository.touchGameActivity(message.roomId)
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

            telemetryRepository.close()
            resolve()
          })
        })
      })
    },
  }
}

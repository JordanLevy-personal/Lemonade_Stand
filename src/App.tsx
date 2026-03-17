import { startTransition, useEffect, useRef, useState } from 'react'
import type { CSSProperties, JSX } from 'react'

import './App.css'
import Customer1Sprite from './assets/customers/customer_1.png'
import Customer2Sprite from './assets/customers/customer_2.png'
import StandSprite from './assets/stand.png'
import { defaultBalanceConfig } from './game/balance'
import {
  calculatePurchaseCost,
  calculateSellableCups,
  emptyInventory,
} from './game/engine'
import type { DailyPlan, Inventory } from './game/types'
import type {
  ClientMessage,
  CustomerEvent,
  FactionDefinition,
  RoomState,
  SimulationStartedMessage,
} from './client/protocol'
import { openRoomConnection, type RoomConnection, type RoomConnectionHandlers } from './client/socket'

export const ROOM_SESSION_KEY = 'lemonade-stand-room-session-v1'

const DEFAULT_HOST_FACTION = 'sun-guild'
const DEFAULT_JOIN_FACTION = 'market-tide'

interface StoredRoomSession {
  roomId: string
  playerId: string
  name: string
  factionId: string
  hostPlayerId: string
}

interface IdentityDraft {
  name: string
  factionId: string
}

interface LobbyForm {
  name: string
  roomId: string
  factionId: string
}

function readStoredRoomSession(): StoredRoomSession | null {
  const stored = window.localStorage.getItem(ROOM_SESSION_KEY)
  if (stored === null) {
    return null
  }

  try {
    return JSON.parse(stored) as StoredRoomSession
  } catch {
    return null
  }
}

function writeStoredRoomSession(session: StoredRoomSession): void {
  window.localStorage.setItem(ROOM_SESSION_KEY, JSON.stringify(session))
}

function searchParam(name: string): string | null {
  return new URLSearchParams(window.location.search).get(name)
}

function factionDefinition(factionId: string): FactionDefinition {
  const faction = defaultBalanceConfig.factions.find((candidate) => candidate.id === factionId)
  if (faction !== undefined) {
    return {
      id: faction.id,
      name: faction.name,
      accentColor: faction.accent,
    }
  }

  return {
    id: DEFAULT_HOST_FACTION,
    name: 'Sun Guild',
    accentColor: '#f3b63f',
  }
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`
}

function numberValue(input: string): number {
  if (input.trim() === '') {
    return 0
  }

  return Number(input)
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function addInventory(left: Inventory, right: Inventory): Inventory {
  return {
    lemons: left.lemons + right.lemons,
    sugar: left.sugar + right.sugar,
    ice: left.ice + right.ice,
  }
}

function findCurrentPlayer(room: RoomState | null, playerId: string | null) {
  if (room === null || playerId === null) {
    return null
  }

  return room.players.find((player) => player.id === playerId) ?? null
}

function weatherLabel(room: RoomState | null): string {
  if (room?.weather === null || room?.weather === undefined) {
    return 'Waiting for both players'
  }

  return defaultBalanceConfig.weatherProfiles[room.weather].label
}

function describeCloseReason(reason: string): string {
  return reason.trim() === '' ? 'No reason provided.' : reason
}

function closeMessage(code: number, reason: string, wasClean: boolean): string {
  if (wasClean) {
    return `The room connection closed. Code ${code}. Reason: ${describeCloseReason(reason)}`
  }

  return `The room connection closed unexpectedly. Code ${code}. Reason: ${describeCloseReason(reason)}`
}

function eventProgress(event: CustomerEvent, elapsedMs: number): number {
  const resolveAt = event.arrivalOffsetMs + 1_500
  if (elapsedMs <= event.arrivalOffsetMs) {
    return 0
  }

  return clamp((elapsedMs - event.arrivalOffsetMs) / Math.max(resolveAt - event.arrivalOffsetMs, 1), 0, 1)
}

function isEventVisible(event: CustomerEvent, elapsedMs: number): boolean {
  return elapsedMs >= event.arrivalOffsetMs && elapsedMs <= event.arrivalOffsetMs + 1_500
}

function isEventResolved(event: CustomerEvent, elapsedMs: number): boolean {
  return elapsedMs >= event.arrivalOffsetMs + 1_500
}

function currentElapsedMs(room: RoomState | null, simulationStartAtMs: number | null, nowMs: number): number {
  if (room?.phase !== 'simulating' || room.simulation === null || simulationStartAtMs === null) {
    return 0
  }

  return clamp(nowMs - simulationStartAtMs, 0, room.simulation.durationMs)
}

function buildSceneStyle(event: CustomerEvent, elapsedMs: number, players: RoomState['players']): CSSProperties {
  const progress = eventProgress(event, elapsedMs)
  const targetIndex = Math.max(
    0,
    players.findIndex((player) => player.id === event.chosenPlayerId),
  )
  const startX = 50
  const targetX = event.chosenPlayerId === null ? 50 : targetIndex === 0 ? 18 : 82
  const xJitter = Math.sin((event.id.length + 3) * 12.7) * 1.5
  const yJitter = Math.cos((event.id.length + 9) * 4.1) * 1.2
  const lane = event.id.length % 3
  const xPercent = startX + (targetX - startX) * progress + xJitter
  const yPercent = 8 + progress * 64 + lane * 5 + yJitter

  return {
    left: `${xPercent}%`,
    bottom: `${yPercent}%`,
  }
}

function buildPlan(currentPlayer: ReturnType<typeof findCurrentPlayer>): DailyPlan {
  if (currentPlayer === null || currentPlayer.dailyPlan === null) {
    return {
      purchases: emptyInventory(),
      recipe: defaultBalanceConfig.defaultRecipe,
      price: defaultBalanceConfig.defaultPrice,
    }
  }

  return {
    purchases: { ...currentPlayer.dailyPlan.purchases },
    recipe: { ...currentPlayer.dailyPlan.recipe },
    price: currentPlayer.dailyPlan.price,
  }
}

function MetricCard({
  label,
  value,
}: {
  label: string
  value: string
}): JSX.Element {
  return (
    <article className="metric-card" aria-label={`${label}: ${value}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </article>
  )
}

function NumberField({
  label,
  value,
  min = 0,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  step?: number
  onChange: (value: number) => void
}): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(event) => onChange(numberValue(event.target.value))}
      />
    </label>
  )
}

function LobbyScreen({
  form,
  reconnectSession,
  error,
  onChange,
  onHost,
  onJoin,
  onReconnect,
}: {
  form: LobbyForm
  reconnectSession: StoredRoomSession | null
  error: string | null
  onChange: (next: Partial<LobbyForm>) => void
  onHost: () => void
  onJoin: () => void
  onReconnect: () => void
}): JSX.Element {
  return (
    <section className="app-stage">
      <div className="panel hero-panel">
        <p className="eyebrow">LAN MVP</p>
        <h1>Multiplayer Lemonade Stand</h1>
        <p className="muted">
          Host a room on this laptop, share the LAN URL, and let the market decide who wins the rush.
        </p>
      </div>

      <div className="panel-grid">
        <section className="panel">
          <p className="eyebrow">Identity</p>
          <h2>Join the market</h2>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Your Name</span>
              <input
                className="field-input"
                value={form.name}
                onChange={(event) => onChange({ name: event.target.value })}
              />
            </label>
            <label className="field">
              <span className="field-label">Faction</span>
              <select
                className="field-input"
                value={form.factionId}
                onChange={(event) => onChange({ factionId: event.target.value })}
              >
                {defaultBalanceConfig.factions.map((faction) => (
                  <option key={faction.id} value={faction.id}>
                    {faction.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="action-row">
            <button className="action-button action-button-primary" onClick={onHost}>
              Host LAN Room
            </button>
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Join</p>
          <h2>Enter a room code</h2>
          <div className="field-grid">
            <label className="field">
              <span className="field-label">Room ID</span>
              <input
                className="field-input"
                value={form.roomId}
                onChange={(event) => onChange({ roomId: event.target.value.toUpperCase() })}
              />
            </label>
          </div>
          <div className="action-row">
            <button className="action-button action-button-secondary" onClick={onJoin}>
              Join LAN Room
            </button>
          </div>
        </section>
      </div>

      {reconnectSession !== null ? (
        <section className="panel">
          <p className="eyebrow">Reconnect</p>
          <button className="action-button action-button-secondary" onClick={onReconnect}>
            Reconnect to {reconnectSession.roomId}
          </button>
        </section>
      ) : null}

      {error !== null ? <p className="error-text">{error}</p> : null}
    </section>
  )
}

function WaitingScreen({
  roomId,
}: {
  roomId: string
}): JSX.Element {
  return (
    <section className="app-stage">
      <div className="panel hero-panel">
        <p className="eyebrow">Room created</p>
        <h1>{roomId}</h1>
        <p className="muted">
          Share your LAN client URL with the second player and have them join room {roomId}.
        </p>
      </div>
    </section>
  )
}

function PlanningScreen({
  room,
  currentPlayer,
  localPlan,
  error,
  onPlanChange,
  onLockIn,
}: {
  room: RoomState
  currentPlayer: NonNullable<ReturnType<typeof findCurrentPlayer>>
  localPlan: DailyPlan
  error: string | null
  onPlanChange: (next: DailyPlan) => void
  onLockIn: () => void
}): JSX.Element {
  const market = room.marketBasePrices ?? emptyInventory()
  const spend = room.marketBasePrices === null ? 0 : calculatePurchaseCost(market, localPlan.purchases)
  const projectedInventory = addInventory(currentPlayer.inventory, localPlan.purchases)
  const projectedCups = calculateSellableCups(projectedInventory, localPlan.recipe)
  const canAfford = spend <= currentPlayer.money

  return (
    <section className="app-stage">
      <div className="panel hero-panel">
        <p className="eyebrow">Planning phase</p>
        <h1>Set today&apos;s edge</h1>
        <p className="muted">
          Forecast: <strong>{weatherLabel(room)}</strong>. Plans stay private until both stands lock in.
        </p>
      </div>

      <div className="metric-grid">
        <MetricCard label="Room" value={room.roomId} />
        <MetricCard label="Day" value={`${room.day}`} />
        <MetricCard label="Cash" value={formatMoney(currentPlayer.money)} />
        <MetricCard label="Projected Cups" value={Number.isFinite(projectedCups) ? `${projectedCups}` : 'Infinite'} />
      </div>

      <div className="panel-grid">
        <section className="panel">
          <p className="eyebrow">Market</p>
          <h2>Buy ingredients</h2>
          <div className="metric-grid compact-grid">
            <MetricCard label="Lemons" value={formatMoney(market.lemons)} />
            <MetricCard label="Sugar" value={formatMoney(market.sugar)} />
            <MetricCard label="Ice" value={formatMoney(market.ice)} />
          </div>
          <div className="field-grid">
            <NumberField
              label="Buy Lemons"
              value={localPlan.purchases.lemons}
              onChange={(lemons) =>
                onPlanChange({
                  ...localPlan,
                  purchases: { ...localPlan.purchases, lemons },
                })
              }
            />
            <NumberField
              label="Buy Sugar"
              value={localPlan.purchases.sugar}
              onChange={(sugar) =>
                onPlanChange({
                  ...localPlan,
                  purchases: { ...localPlan.purchases, sugar },
                })
              }
            />
            <NumberField
              label="Buy Ice"
              value={localPlan.purchases.ice}
              onChange={(ice) =>
                onPlanChange({
                  ...localPlan,
                  purchases: { ...localPlan.purchases, ice },
                })
              }
            />
          </div>
          <p className="muted">Shopping basket: {formatMoney(spend)}</p>
        </section>

        <section className="panel">
          <p className="eyebrow">Recipe</p>
          <h2>Dial in the recipe</h2>
          <div className="field-grid">
            <NumberField
              label="Lemons per Cup"
              value={localPlan.recipe.lemons}
              min={0}
              onChange={(lemons) =>
                onPlanChange({
                  ...localPlan,
                  recipe: { ...localPlan.recipe, lemons },
                })
              }
            />
            <NumberField
              label="Sugar per Cup"
              value={localPlan.recipe.sugar}
              min={0}
              onChange={(sugar) =>
                onPlanChange({
                  ...localPlan,
                  recipe: { ...localPlan.recipe, sugar },
                })
              }
            />
            <NumberField
              label="Ice per Cup"
              value={localPlan.recipe.ice}
              min={0}
              onChange={(ice) =>
                onPlanChange({
                  ...localPlan,
                  recipe: { ...localPlan.recipe, ice },
                })
              }
            />
            <NumberField
              label="Price per Cup"
              value={localPlan.price}
              step={0.05}
              onChange={(price) => onPlanChange({ ...localPlan, price })}
            />
          </div>
          <div className="action-row">
            <button
              className="action-button action-button-primary"
              disabled={!canAfford || currentPlayer.hasSubmittedPlan}
              onClick={onLockIn}
            >
              Lock in Plan
            </button>
            <p className="muted">
              {currentPlayer.hasSubmittedPlan ? 'Plan locked. Waiting on the other stand.' : 'Your choices stay private until both players are ready.'}
            </p>
          </div>
          {error !== null ? <p className="error-text">{error}</p> : null}
        </section>
      </div>
    </section>
  )
}

function SimulationScreen({
  room,
  elapsedMs,
}: {
  room: RoomState
  elapsedMs: number
}): JSX.Element {
  const simulation = room.simulation
  if (simulation === null) {
    return (
      <section className="app-stage">
        <div className="panel">
          <p className="muted">Simulation data is missing.</p>
        </div>
      </section>
    )
  }

  const visibleEvents = simulation.customerEvents.filter((event) => isEventVisible(event, elapsedMs))
  const resolvedEvents = simulation.customerEvents.filter((event) => isEventResolved(event, elapsedMs))
  const playerSales = room.players.map((player) =>
    resolvedEvents.filter((event) => event.outcome === 'buy' && event.chosenPlayerId === player.id).length,
  )

  return (
    <section className="app-stage">
      <div className="panel hero-panel">
        <p className="eyebrow">Simulation phase</p>
        <h1>Crowd Rush</h1>
        <p className="muted">Shared timeline live. The same customer wave is playing on every connected laptop.</p>
      </div>

      <div className="metric-grid">
        <MetricCard label="Resolved" value={`${resolvedEvents.length}/${simulation.customerEvents.length}`} />
        <MetricCard label="Weather" value={weatherLabel(room)} />
        <MetricCard label="Timeline" value={`${Math.round((elapsedMs / simulation.durationMs) * 100)}%`} />
      </div>

      <section className="panel crowd-panel">
        <div className="crowd-scene">
          <div className="crowd-road" aria-hidden="true" />
          <div className="stand-column stand-column-left">
            <p className="stand-name">{room.players[0]?.name}</p>
            <img className="stand-sprite" src={StandSprite} alt={`${room.players[0]?.name} stand`} />
            <span className="stand-score">{playerSales[0] ?? 0} sales</span>
          </div>
          <div className="stand-column stand-column-right">
            <p className="stand-name">{room.players[1]?.name}</p>
            <img className="stand-sprite" src={StandSprite} alt={`${room.players[1]?.name} stand`} />
            <span className="stand-score">{playerSales[1] ?? 0} sales</span>
          </div>

          {visibleEvents.map((event) => (
            <div className={`crowd-customer crowd-${event.outcome}`} key={event.id} style={buildSceneStyle(event, elapsedMs, room.players)}>
              <img
                className="customer-sprite"
                src={event.id.length % 2 === 0 ? Customer1Sprite : Customer2Sprite}
                alt="Customer"
              />
              {event.outcome === 'buy' ? <span className="sale-tag">+{formatMoney(event.salePrice)}</span> : null}
            </div>
          ))}
        </div>
      </section>
    </section>
  )
}

function ResultsScreen({
  room,
  currentPlayerId,
  onNextDay,
}: {
  room: RoomState
  currentPlayerId: string | null
  onNextDay: () => void
}): JSX.Element {
  const hasRequestedNextDay =
    currentPlayerId !== null && room.requestedNextDayPlayerIds.includes(currentPlayerId)

  return (
    <section className="app-stage">
      <div className="panel hero-panel">
        <p className="eyebrow">Results phase</p>
        <h1>Market Results</h1>
        <p className="muted">Compare both stands, then request the next day when everyone is ready to keep playing.</p>
      </div>

      <div className="panel-grid">
        {room.players.map((player) => (
          <section className="panel" key={player.id}>
            <p className="eyebrow">{player.faction.name}</p>
            <h2>{player.name}</h2>
            <div className="metric-grid compact-grid">
              <MetricCard label="Cups Sold" value={`${player.dailyResults?.cupsSold ?? 0}`} />
              <MetricCard label="Revenue" value={formatMoney(player.dailyResults?.revenue ?? 0)} />
              <MetricCard label="Satisfaction" value={`${Math.round((player.dailyResults?.satisfaction ?? 0) * 100)}%`} />
              <MetricCard label="Rep Change" value={`${(player.dailyResults?.reputationDelta ?? 0) >= 0 ? '+' : ''}${player.dailyResults?.reputationDelta ?? 0}`} />
            </div>
          </section>
        ))}
      </div>

      <div className="panel">
        <button
          className="action-button action-button-primary"
          disabled={hasRequestedNextDay}
          onClick={onNextDay}
        >
          Request Next Day
        </button>
        <p className="muted">
          {hasRequestedNextDay
            ? 'Next day requested. Waiting on the other stand.'
            : 'Request the next day when you are ready to keep playing.'}
        </p>
      </div>
    </section>
  )
}

function PausedScreen({ room }: { room: RoomState }): JSX.Element {
  return (
    <section className="app-stage">
      <div className="panel hero-panel">
        <p className="eyebrow">Connection paused</p>
        <h1>Waiting for all players</h1>
        <p className="muted">
          Room {room.roomId} is paused because someone disconnected. Reconnect the missing player to resume.
        </p>
      </div>
    </section>
  )
}

function App(): JSX.Element {
  const [reconnectSession, setReconnectSession] = useState<StoredRoomSession | null>(() =>
    readStoredRoomSession(),
  )
  const [lobbyForm, setLobbyForm] = useState<LobbyForm>({
    name: reconnectSession?.name ?? searchParam('name') ?? '',
    roomId: reconnectSession?.roomId ?? searchParam('roomId') ?? '',
    factionId: reconnectSession?.factionId ?? searchParam('faction') ?? DEFAULT_HOST_FACTION,
  })
  const [session, setSession] = useState<StoredRoomSession | null>(null)
  const [room, setRoom] = useState<RoomState | null>(null)
  const [localPlan, setLocalPlan] = useState<DailyPlan>({
    purchases: emptyInventory(),
    recipe: defaultBalanceConfig.defaultRecipe,
    price: defaultBalanceConfig.defaultPrice,
  })
  const [simulationStartAtMs, setSimulationStartAtMs] = useState<number | null>(null)
  const [clockNowMs, setClockNowMs] = useState(Date.now())
  const [error, setError] = useState<string | null>(null)
  const connectionRef = useRef<RoomConnection | null>(null)
  const pendingIdentityRef = useRef<IdentityDraft | null>(null)

  const currentPlayer = findCurrentPlayer(room, session?.playerId ?? null)
  const elapsedMs = currentElapsedMs(room, simulationStartAtMs, clockNowMs)

  useEffect(() => {
    if (currentPlayer !== null) {
      setLocalPlan(buildPlan(currentPlayer))
    }
  }, [
    currentPlayer?.id,
    currentPlayer?.dailyPlan?.price,
    currentPlayer?.dailyPlan?.recipe.lemons,
    currentPlayer?.dailyPlan?.recipe.sugar,
    currentPlayer?.dailyPlan?.recipe.ice,
    currentPlayer?.dailyPlan?.purchases.lemons,
    currentPlayer?.dailyPlan?.purchases.sugar,
    currentPlayer?.dailyPlan?.purchases.ice,
  ])

  useEffect(() => {
    if (room?.phase !== 'simulating') {
      setSimulationStartAtMs(null)
      return
    }

    const intervalId = window.setInterval(() => {
      setClockNowMs(Date.now())
    }, 100)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [room?.phase])

  useEffect(() => {
    const renderGameToText = (): string =>
      JSON.stringify({
        roomId: room?.roomId ?? null,
        phase: room?.phase ?? 'lobby',
        day: room?.day ?? null,
        weather: room?.weather ?? null,
        playerId: session?.playerId ?? null,
        elapsedMs,
        visibleCustomers:
          room?.simulation?.customerEvents
            .filter((event) => isEventVisible(event, elapsedMs))
            .map((event) => ({
              id: event.id,
              targetPlayerId: event.chosenPlayerId,
              outcome: event.outcome,
            })) ?? [],
      })

    const appWindow = window as Window & {
      advanceTime?: (ms: number) => void
      render_game_to_text?: () => string
    }

    appWindow.advanceTime = (ms: number) => {
      setClockNowMs((current) => current + Math.max(0, ms))
    }
    appWindow.render_game_to_text = renderGameToText

    return () => {
      delete appWindow.advanceTime
      delete appWindow.render_game_to_text
    }
  }, [elapsedMs, room, session?.playerId])

  function updateSession(nextSession: StoredRoomSession): void {
    setSession(nextSession)
    setReconnectSession(nextSession)
    writeStoredRoomSession(nextSession)
  }

  function createHandlers(): RoomConnectionHandlers {
    return {
      onMessage(message) {
        startTransition(() => {
          if (message.type === 'connected') {
            const identity = pendingIdentityRef.current
            if (identity !== null) {
              updateSession({
                roomId: message.roomId,
                playerId: message.playerId,
                name: identity.name,
                factionId: identity.factionId,
                hostPlayerId: message.hostPlayerId,
              })
            }
            return
          }

          if (message.type === 'room_state') {
            setRoom(message.room)
            setError(null)

            if (session !== null) {
              updateSession({
                ...session,
                roomId: message.room.roomId,
                hostPlayerId: message.room.hostPlayerId,
              })
            }
            return
          }

          if (message.type === 'simulation_started') {
            const simulationMessage = message as SimulationStartedMessage
            setRoom(simulationMessage.room)
            setSimulationStartAtMs(simulationMessage.simulationStartAt)
            setClockNowMs(Date.now())
            setError(null)
            return
          }

          setError(message.message)
        })
      },
      onClose(details) {
        setError((current) => current ?? closeMessage(details.code, details.reason, details.wasClean))
      },
      onError(message) {
        setError(message)
      },
    }
  }

  function connectAndSend(message: ClientMessage, identity: IdentityDraft): void {
    pendingIdentityRef.current = identity
    setError(null)
    connectionRef.current?.close()
    connectionRef.current = openRoomConnection(createHandlers())
    connectionRef.current.send(message)
  }

  function hostRoom(): void {
    if (lobbyForm.name.trim() === '') {
      setError('Enter your name before hosting a room.')
      return
    }

    connectAndSend(
      {
        type: 'create_room',
        name: lobbyForm.name,
        faction: factionDefinition(lobbyForm.factionId),
      },
      {
        name: lobbyForm.name,
        factionId: lobbyForm.factionId,
      },
    )
  }

  function joinRoomFlow(playerId?: string, factionId = DEFAULT_JOIN_FACTION): void {
    if (lobbyForm.name.trim() === '' && playerId === undefined) {
      setError('Enter your name before joining a room.')
      return
    }
    if (lobbyForm.roomId.trim() === '') {
      setError('Enter a room id before joining.')
      return
    }

    connectAndSend(
      {
        type: 'join_room',
        roomId: lobbyForm.roomId.trim().toUpperCase(),
        name: lobbyForm.name,
        faction: factionDefinition(factionId),
        playerId,
      },
      {
        name: lobbyForm.name,
        factionId,
      },
    )
  }

  function reconnectToRoom(): void {
    if (reconnectSession === null) {
      return
    }

    setLobbyForm((current) => ({
      ...current,
      name: reconnectSession.name,
      roomId: reconnectSession.roomId,
      factionId: reconnectSession.factionId,
    }))
    connectAndSend(
      {
        type: 'join_room',
        roomId: reconnectSession.roomId,
        name: reconnectSession.name,
        faction: factionDefinition(reconnectSession.factionId),
        playerId: reconnectSession.playerId,
      },
      {
        name: reconnectSession.name,
        factionId: reconnectSession.factionId,
      },
    )
  }

  function lockInPlan(): void {
    if (room === null || session === null) {
      return
    }

    connectionRef.current?.send({
      type: 'submit_plan',
      roomId: room.roomId,
      playerId: session.playerId,
      plan: localPlan,
    })
  }

  function requestNextDay(): void {
    if (room === null || session === null) {
      return
    }

    connectionRef.current?.send({
      type: 'request_next_day',
      roomId: room.roomId,
      playerId: session.playerId,
    })
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Shared Market</p>
          <strong className="topbar-title">Lemonade Stand LAN</strong>
        </div>
        {room !== null ? (
          <div className="topbar-metrics">
            <span className="summary-chip">Room {room.roomId}</span>
            <span className="summary-chip">Day {room.day}</span>
            <span className="summary-chip">{weatherLabel(room)}</span>
          </div>
        ) : null}
      </header>

      {session !== null && (room === null || room.phase === 'lobby') ? (
        <WaitingScreen roomId={room?.roomId ?? session.roomId} />
      ) : null}
      {room === null ? (
        <LobbyScreen
          form={lobbyForm}
          reconnectSession={reconnectSession}
          error={error}
          onChange={(next) => setLobbyForm((current) => ({ ...current, ...next }))}
          onHost={hostRoom}
          onJoin={() => joinRoomFlow(undefined, lobbyForm.factionId)}
          onReconnect={reconnectToRoom}
        />
      ) : null}
      {room?.phase === 'planning' && currentPlayer !== null ? (
        <PlanningScreen
          room={room}
          currentPlayer={currentPlayer}
          localPlan={localPlan}
          error={error}
          onPlanChange={setLocalPlan}
          onLockIn={lockInPlan}
        />
      ) : null}
      {room?.phase === 'simulating' ? <SimulationScreen room={room} elapsedMs={elapsedMs} /> : null}
      {room?.phase === 'results' ? (
        <ResultsScreen
          room={room}
          currentPlayerId={session?.playerId ?? null}
          onNextDay={requestNextDay}
        />
      ) : null}
      {room?.phase === 'paused' ? <PausedScreen room={room} /> : null}
    </main>
  )
}

export default App

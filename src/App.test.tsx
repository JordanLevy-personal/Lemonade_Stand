import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App, { ROOM_SESSION_KEY } from './App'
import type { RoomConnection, RoomConnectionHandlers } from './client/socket'
import type { FactionDefinition, RoomState } from './client/protocol'

const sendMock = vi.fn()
const closeMock = vi.fn()
const openRoomConnectionMock = vi.fn()

let latestHandlers: RoomConnectionHandlers | null = null

vi.mock('./client/socket', () => ({
  openRoomConnection: (handlers: RoomConnectionHandlers): RoomConnection => {
    latestHandlers = handlers
    openRoomConnectionMock(handlers)

    return {
      send: sendMock,
      close: closeMock,
    }
  },
}))

const SUN_FACTION: FactionDefinition = {
  id: 'sun-guild',
  name: 'Sun Guild',
  accentColor: '#f3b63f',
}

const MARKET_FACTION: FactionDefinition = {
  id: 'market-tide',
  name: 'Market Tide',
  accentColor: '#4b8e8d',
}

function createRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomId: 'ROOM-42',
    hostPlayerId: 'player-host',
    day: 2,
    weather: 'hot',
    phase: 'planning',
    marketBasePrices: {
      lemons: 0.45,
      sugar: 0.18,
      ice: 0.09,
    },
    simulation: null,
    pausedFromPhase: null,
    requestedNextDayPlayerIds: [],
    players: [
      {
        id: 'player-host',
        name: 'Alex',
        faction: SUN_FACTION,
        money: 20,
        inventory: {
          lemons: 0,
          sugar: 0,
          ice: 0,
        },
        reputation: 50,
        hasSubmittedPlan: false,
        connectionStatus: 'connected',
        dailyPlan: {
          purchases: {
            lemons: 1,
            sugar: 1,
            ice: 1,
          },
          recipe: {
            lemons: 2,
            sugar: 2,
            ice: 3,
          },
          price: 1.4,
        },
        dailyResults: null,
      },
      {
        id: 'player-guest',
        name: 'Blair',
        faction: MARKET_FACTION,
        money: 20,
        inventory: {
          lemons: 0,
          sugar: 0,
          ice: 0,
        },
        reputation: 50,
        hasSubmittedPlan: false,
        connectionStatus: 'connected',
        dailyPlan: {
          purchases: {
            lemons: 1,
            sugar: 1,
            ice: 1,
          },
          recipe: {
            lemons: 2,
            sugar: 2,
            ice: 2,
          },
          price: 1.5,
        },
        dailyResults: null,
      },
    ],
    ...overrides,
  }
}

function createHostRoom(
  playerOverrides: Partial<RoomState['players'][number]> = {},
  roomOverrides: Partial<RoomState> = {},
): RoomState {
  const room = createRoom(roomOverrides)

  return {
    ...room,
    players: [
      {
        ...room.players[0],
        ...playerOverrides,
      },
      room.players[1],
    ],
  }
}

function getPanelByText(pattern: RegExp): HTMLElement {
  const source = screen.getAllByText(pattern)[0]
  const panel = source.closest('.panel')

  if (panel === null) {
    throw new Error(`Unable to find panel for ${pattern.toString()}`)
  }

  return panel as HTMLElement
}
function emitMessage(message: unknown): void {
  act(() => {
    latestHandlers?.onMessage(message as never)
  })
}

describe('App', () => {
  beforeEach(() => {
    latestHandlers = null
    sendMock.mockReset()
    closeMock.mockReset()
    openRoomConnectionMock.mockReset()
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates a room from the lobby', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: /host room/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join room/i })).toBeInTheDocument()
    expect(screen.queryByText(/lan/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    expect(openRoomConnectionMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith({
      type: 'create_room',
      name: 'Alex',
      faction: SUN_FACTION,
    })
  })

  it('shows room wording in the waiting room after the host creates a room', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createRoom({ phase: 'lobby' }),
    })

    expect(screen.getByText(/share your .*client url/i)).toBeInTheDocument()
    expect(screen.getByText(/join room room-42/i)).toBeInTheDocument()
    expect(screen.queryByText(/lan/i)).not.toBeInTheDocument()
  })

  it('submits a private plan during planning', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createRoom(),
    })

    fireEvent.change(screen.getByLabelText(/buy lemons/i), {
      target: { value: '4' },
    })
    fireEvent.change(screen.getByLabelText(/price per cup/i), {
      target: { value: '1.75' },
    })
    fireEvent.click(screen.getByRole('button', { name: /lock in plan/i }))

    expect(sendMock).toHaveBeenLastCalledWith({
      type: 'submit_plan',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      plan: {
        purchases: {
          lemons: 4,
          sugar: 1,
          ice: 1,
        },
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 3,
        },
        price: 1.75,
      },
    })
  })

  it('blocks zero lemons and sugar in submitted recipes while allowing zero ice', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createRoom(),
    })

    fireEvent.change(screen.getByLabelText(/^Lemons per Cup$/i), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText(/^Sugar per Cup$/i), {
      target: { value: '0' },
    })
    fireEvent.change(screen.getByLabelText(/^Ice per Cup$/i), {
      target: { value: '0' },
    })
    fireEvent.click(screen.getByRole('button', { name: /lock in plan/i }))

    expect(sendMock).toHaveBeenLastCalledWith({
      type: 'submit_plan',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      plan: {
        purchases: {
          lemons: 1,
          sugar: 1,
          ice: 1,
        },
        recipe: {
          lemons: 0.1,
          sugar: 0.1,
          ice: 0,
        },
        price: 1.4,
      },
    })
  })

  it('submits fractional recipe values without rounding them up to whole numbers', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createRoom(),
    })

    fireEvent.change(screen.getByLabelText(/^Lemons per Cup$/i), {
      target: { value: '0.5' },
    })
    fireEvent.change(screen.getByLabelText(/^Sugar per Cup$/i), {
      target: { value: '0.3' },
    })
    fireEvent.change(screen.getByLabelText(/^Ice per Cup$/i), {
      target: { value: '1.2' },
    })
    fireEvent.click(screen.getByRole('button', { name: /lock in plan/i }))

    expect(sendMock).toHaveBeenLastCalledWith({
      type: 'submit_plan',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      plan: {
        purchases: {
          lemons: 1,
          sugar: 1,
          ice: 1,
        },
        recipe: {
          lemons: 0.5,
          sugar: 0.3,
          ice: 1.2,
        },
        price: 1.4,
      },
    })
  })

  it('shows inventory projection and ingredient cost during planning', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createHostRoom(
        {
          inventory: {
            lemons: 9,
            sugar: 14,
            ice: 19,
          },
          dailyPlan: {
            purchases: {
              lemons: 1,
              sugar: 2,
              ice: 3,
            },
            recipe: {
              lemons: 2,
              sugar: 2,
              ice: 3,
            },
            price: 1.4,
          },
        },
      ),
    })

    const inventoryPanel = getPanelByText(/inventory/i)
    const scopedInventory = within(inventoryPanel)

    expect(scopedInventory.getAllByText(/current inventory/i).length).toBeGreaterThan(0)
    expect(scopedInventory.getAllByText(/projected inventory|after shopping/i).length).toBeGreaterThan(0)
    expect(scopedInventory.getByText('9')).toBeInTheDocument()
    expect(scopedInventory.getByText('14')).toBeInTheDocument()
    expect(scopedInventory.getByText('19')).toBeInTheDocument()
    expect(scopedInventory.getByText('10')).toBeInTheDocument()
    expect(scopedInventory.getByText('16')).toBeInTheDocument()
    expect(scopedInventory.getByText('22')).toBeInTheDocument()
    expect(screen.getByText(/\$1\.53/)).toBeInTheDocument()
  })

  it('updates the ingredient cost per cup when the recipe changes', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createHostRoom({
        dailyPlan: {
          purchases: {
            lemons: 1,
            sugar: 2,
            ice: 3,
          },
          recipe: {
            lemons: 2,
            sugar: 2,
            ice: 3,
          },
          price: 1.4,
        },
      }),
    })

    expect(screen.getByText(/\$1\.53/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/lemons per cup/i), {
      target: { value: '3' },
    })

    expect(screen.getByText(/\$1\.98/)).toBeInTheDocument()
  })

  it('renders the simulation scene from a shared start event', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T12:00:02.000Z'))

    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'simulation_started',
      simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
      room: createRoom({
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [
            {
              id: 'event-a',
              arrivalOffsetMs: 0,
              willingnessToPay: 2,
              chosenPlayerId: 'player-host',
              outcome: 'buy',
              salePrice: 1.5,
              satisfaction: 0.8,
            },
            {
              id: 'event-b',
              arrivalOffsetMs: 400,
              willingnessToPay: 1,
              chosenPlayerId: 'player-guest',
              outcome: 'skip',
              salePrice: 0,
              satisfaction: 0,
            },
          ],
        },
      }),
    })

    expect(screen.getByRole('heading', { name: /crowd rush/i })).toBeInTheDocument()
    expect(screen.getByText(/shared timeline live/i)).toBeInTheDocument()
    expect(screen.getAllByText(/alex/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/blair/i).length).toBeGreaterThan(0)
  })

  it('depletes the current player inventory as simulation sales resolve', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T12:00:00.000Z'))

    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'simulation_started',
      simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
      room: createHostRoom(
        {
          inventory: {
            lemons: 3,
            sugar: 4,
            ice: 5,
          },
          dailyPlan: {
            purchases: {
              lemons: 0,
              sugar: 0,
              ice: 0,
            },
            recipe: {
              lemons: 1,
              sugar: 1,
              ice: 1,
            },
            price: 1.5,
          },
        },
        {
          phase: 'simulating',
          simulation: {
            durationMs: 6000,
            simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
            customerEvents: [
              {
                id: 'event-a',
                arrivalOffsetMs: 0,
                willingnessToPay: 2,
                chosenPlayerId: 'player-host',
                outcome: 'buy',
                salePrice: 1.5,
                satisfaction: 0.8,
              },
              {
                id: 'event-b',
                arrivalOffsetMs: 400,
                willingnessToPay: 1,
                chosenPlayerId: 'player-guest',
                outcome: 'skip',
                salePrice: 0,
                satisfaction: 0,
              },
            ],
          },
        },
      ),
    })

    const inventoryPanel = getPanelByText(/inventory/i)
    const scopedInventory = within(inventoryPanel)

    expect(scopedInventory.getByText('3')).toBeInTheDocument()
    expect(scopedInventory.getByText('4')).toBeInTheDocument()
    expect(scopedInventory.getByText('5')).toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1_600)
    })

    expect(scopedInventory.getByText('2')).toBeInTheDocument()
    expect(scopedInventory.getByText('3')).toBeInTheDocument()
    expect(scopedInventory.getByText('4')).toBeInTheDocument()
  })

  it('requests the next day from the results screen', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createRoom({
        phase: 'results',
        players: createRoom().players.map((player) => ({
          ...player,
          dailyResults:
            player.id === 'player-host'
              ? {
                  cupsSold: 12,
                  revenue: 18,
                  satisfaction: 0.79,
                  reputationDelta: 4,
                }
              : {
                  cupsSold: 9,
                  revenue: 13.5,
                  satisfaction: 0.68,
                  reputationDelta: 1,
                },
        })),
      }),
    })

    fireEvent.click(screen.getByRole('button', { name: /request next day/i }))

    expect(sendMock).toHaveBeenLastCalledWith({
      type: 'request_next_day',
      roomId: 'ROOM-42',
      playerId: 'player-host',
    })
  })

  it('offers reconnect using the stored room session', () => {
    window.localStorage.setItem(
      ROOM_SESSION_KEY,
      JSON.stringify({
        roomId: 'ROOM-42',
        playerId: 'player-guest',
        name: 'Blair',
        factionId: 'market-tide',
        hostPlayerId: 'player-host',
      }),
    )

    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /reconnect to room-42/i }))

    expect(openRoomConnectionMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith({
      type: 'join_room',
      roomId: 'ROOM-42',
      name: 'Blair',
      faction: MARKET_FACTION,
      playerId: 'player-guest',
    })
  })

  it('shows websocket close diagnostics when the room connection closes unexpectedly', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    act(() => {
      latestHandlers?.onClose?.({
        code: 1006,
        reason: '',
        wasClean: false,
      })
    })

    expect(screen.getByText(/room connection closed unexpectedly/i)).toBeInTheDocument()
    expect(screen.getByText(/code 1006/i)).toBeInTheDocument()
  })
})

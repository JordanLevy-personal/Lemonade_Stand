import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App, { ROOM_SESSION_KEY } from './App'
import type { RoomConnection, RoomConnectionHandlers } from './client/socket'
import type { FactionDefinition, Recipe, RoomState } from './client/protocol'

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

type HistoryEntry = RoomState['players'][number]['history'][number] & {
  endingMoney: number
  recipeSnapshot: Recipe
}

function createRoom(overrides: Partial<RoomState> = {}): RoomState {
  return {
    roomId: 'ROOM-42',
    hostPlayerId: 'player-host',
    gameMode: 'multiplayer',
    targetPlayerCount: 2,
    day: 2,
    runLengthDays: 14,
    isGameComplete: false,
    finalOutcome: null,
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
        history: [],
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
        history: [],
      },
    ],
    ...overrides,
  } as RoomState
}

function createHistoryEntry(overrides: Partial<HistoryEntry> = {}): HistoryEntry {
  return {
    day: 1,
    revenue: 18,
    purchaseCost: 6,
    profit: 12,
    endingMoney: 24,
    reputationAfter: 54,
    cupsSold: 12,
    satisfaction: 0.79,
    recipeSnapshot: {
      lemons: 2,
      sugar: 2,
      ice: 3,
    },
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

function createSoloRoom(
  playerOverrides: Partial<RoomState['players'][number]> = {},
  roomOverrides: Partial<RoomState> = {},
): RoomState {
  const room = createRoom({
    gameMode: 'singleplayer',
    targetPlayerCount: 1,
    players: [createRoom().players[0]],
    ...roomOverrides,
  })

  return {
    ...room,
    players: [
      {
        ...room.players[0],
        ...playerOverrides,
      },
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

function createSimulationEvent(
  overrides: Partial<NonNullable<NonNullable<RoomState['simulation']>['customerEvents']>[number]> = {},
): NonNullable<NonNullable<RoomState['simulation']>['customerEvents']>[number] {
  return {
    id: 'event-a',
    customerId: 'customer-a',
    customerIndex: 0,
    spawnAt: 0,
    outcomeAt: 1_500,
    exitAt: 2_000,
    standStops: [
      {
        playerId: 'player-host',
        arriveAt: 500,
        departAt: 1_500,
      },
    ],
    targetPlayerId: 'player-host',
    outcome: 'buy',
    salePrice: 1.5,
    satisfaction: 0.8,
    willingnessToPay: 2,
    lane: 0,
    xJitter: 0,
    yJitter: 0,
    ...overrides,
  }
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
    expect(screen.getByRole('button', { name: /play single-player/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /join room/i })).toBeInTheDocument()
    expect(screen.queryByText(/lan/i)).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    expect(openRoomConnectionMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'create_room',
        name: 'Alex',
        gameMode: 'multiplayer',
        targetPlayerCount: 2,
        runLengthDays: 14,
        faction: SUN_FACTION,
        analyticsPlayerId: expect.any(String),
      }),
    )
  })

  it('sends the selected 30-day run length when hosting a room', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.change(screen.getByLabelText(/run length/i), {
      target: { value: '30' },
    })
    fireEvent.click(screen.getByRole('button', { name: /host room/i }))

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'create_room',
        runLengthDays: 30,
      }),
    )
  })

  it('creates a singleplayer room from the lobby', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /play single-player/i }))

    expect(openRoomConnectionMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'create_room',
        name: 'Alex',
        gameMode: 'singleplayer',
        targetPlayerCount: 1,
        runLengthDays: 14,
        faction: SUN_FACTION,
        analyticsPlayerId: expect.any(String),
      }),
    )
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

    fireEvent.change(screen.getByLabelText(/lemons @/i), {
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

  it('shows solo planning copy without waiting on another player', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /play single-player/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createSoloRoom({ hasSubmittedPlan: false }, { phase: 'planning' }),
    })

    expect(screen.getByText(/lock in your plan to start the day/i)).toBeInTheDocument()
    expect(screen.getByText(/you are the only stand today/i)).toBeInTheDocument()
    expect(screen.queryByText(/both players are ready/i)).not.toBeInTheDocument()
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

  it('renders recipe controls as bounded sliders with the requested stepping', () => {
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

    const lemonsSlider = screen.getByRole('slider', { name: /^Lemons per Cup$/i })
    const sugarSlider = screen.getByRole('slider', { name: /^Sugar per Cup$/i })
    const iceSlider = screen.getByRole('slider', { name: /^Ice per Cup$/i })

    expect(lemonsSlider).toHaveAttribute('min', '0.1')
    expect(lemonsSlider).toHaveAttribute('max', '5')
    expect(lemonsSlider).toHaveAttribute('step', '0.1')

    expect(sugarSlider).toHaveAttribute('min', '0.1')
    expect(sugarSlider).toHaveAttribute('max', '5')
    expect(sugarSlider).toHaveAttribute('step', '0.1')

    expect(iceSlider).toHaveAttribute('min', '0')
    expect(iceSlider).toHaveAttribute('max', '5')
    expect(iceSlider).toHaveAttribute('step', '1')
  })

  it('submits recipe slider values without rounding lemons or sugar up to whole numbers', () => {
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
      target: { value: '1' },
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
          ice: 1,
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

  it('uses the dedicated planning inventory layout classes for responsive wrapping', () => {
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

    const inventoryPanel = getPanelByText(/inventory/i)
    const planningInventoryGrid = inventoryPanel.querySelector('.planning-inventory-grid')

    expect(planningInventoryGrid).not.toBeNull()
    expect(planningInventoryGrid?.querySelectorAll('.inventory-metric-grid')).toHaveLength(2)
  })

  it('uses a dedicated responsive grid hook for the planning market inputs', () => {
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

    const marketPanel = getPanelByText(/buy ingredients/i)
    const planningMarketGrid = marketPanel.querySelector('.planning-buy-field-grid')

    expect(planningMarketGrid).not.toBeNull()
    expect(planningMarketGrid?.querySelectorAll('.buy-field-column')).toHaveLength(3)
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
            createSimulationEvent(),
            createSimulationEvent({
              id: 'event-b',
              customerId: 'customer-b',
              customerIndex: 1,
              spawnAt: 400,
              outcomeAt: 2_100,
              exitAt: 2_600,
              standStops: [
                {
                  playerId: 'player-guest',
                  arriveAt: 900,
                  departAt: 1_900,
                },
              ],
              targetPlayerId: 'player-guest',
              outcome: 'skip',
              salePrice: 0,
              satisfaction: 0,
              willingnessToPay: 1,
              lane: 1,
            }),
          ],
        },
      }),
    })

    expect(screen.getByRole('heading', { name: /crowd rush/i })).toBeInTheDocument()
    expect(screen.getByText(/shared timeline live/i)).toBeInTheDocument()
    expect(screen.getAllByText(/alex/i).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/blair/i).length).toBeGreaterThan(0)
    expect(screen.getByLabelText(/time: 11:20 am/i)).toBeInTheDocument()
  })

  it('shows only one stand during a singleplayer simulation', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T12:00:02.000Z'))

    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /play single-player/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'simulation_started',
      simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
      room: createSoloRoom(
        {},
        {
          phase: 'simulating',
          simulation: {
            durationMs: 6000,
            simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
            customerEvents: [],
          },
        },
      ),
    })

    expect(screen.getByAltText(/alex stand/i)).toBeInTheDocument()
    expect(screen.queryByText(/blair/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/time: 11:20 am/i)).toBeInTheDocument()
  })

  it('renders the simulation business clock from 8:00 AM through 6:00 PM', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [],
        },
      }),
    })

    expect(screen.getByLabelText(/time: 8:00 am/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/timeline:/i)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(6000)
    })

    expect(screen.getByLabelText(/time: 6:00 pm/i)).toBeInTheDocument()
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
              createSimulationEvent(),
              createSimulationEvent({
                id: 'event-b',
                customerId: 'customer-b',
                customerIndex: 1,
                spawnAt: 400,
                outcomeAt: 2_100,
                exitAt: 2_600,
                standStops: [
                  {
                    playerId: 'player-guest',
                    arriveAt: 900,
                    departAt: 1_900,
                  },
                ],
                targetPlayerId: 'player-guest',
                outcome: 'skip',
                salePrice: 0,
                satisfaction: 0,
                willingnessToPay: 1,
                lane: 1,
              }),
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

  it('shows a thumbs-up reaction for a satisfied purchase after the stand pause resolves', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [createSimulationEvent()],
        },
      }),
    })

    expect(screen.queryByLabelText(/customer approval reaction/i)).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1_600)
    })

    expect(screen.getByLabelText(/customer approval reaction/i)).toBeInTheDocument()
    expect(screen.getByText('👍')).toBeInTheDocument()
  })

  it('hides the sale amount until the purchase outcome resolves', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [createSimulationEvent()],
        },
      }),
    })

    expect(screen.queryByText('+$1.50')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1_600)
    })

    expect(screen.getByText('+$1.50')).toBeInTheDocument()
  })

  it('shows the sale amount during the final three quarters of a second before a buying customer exits', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [
            createSimulationEvent({
              outcomeAt: 2_000,
              exitAt: 2_200,
            }),
          ],
        },
      }),
    })

    expect(screen.queryByText('+$1.50')).not.toBeInTheDocument()

    act(() => {
      vi.advanceTimersByTime(1_500)
    })

    expect(screen.getByText('+$1.50')).toBeInTheDocument()
    expect(screen.queryByLabelText(/customer approval reaction/i)).not.toBeInTheDocument()
  })

  it('shows a developer-only simulation speed slider and updates playback speed', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [createSimulationEvent()],
        },
      }),
    })

    const speedSlider = screen.getByRole('slider', { name: /simulation speed/i })
    expect(speedSlider).toHaveValue('1')

    act(() => {
      vi.advanceTimersByTime(500)
    })

    expect(screen.getByLabelText(/time: 8:50 am/i)).toBeInTheDocument()

    fireEvent.change(speedSlider, {
      target: { value: '2' },
    })

    expect(screen.getByLabelText(/time: 9:40 am/i)).toBeInTheDocument()
  })

  it('lets developer mode override the simulation weather visuals locally', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        weather: 'hot',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [],
        },
      }),
    })

    const weatherOverride = screen.getByLabelText(/weather override/i)
    expect(weatherOverride).toHaveValue('live')
    expect(screen.getByLabelText(/weather: hot/i)).toBeInTheDocument()

    fireEvent.change(weatherOverride, {
      target: { value: 'raining' },
    })

    const scene = screen.getByRole('img', { name: /simulation scene/i })

    expect(screen.getByLabelText(/weather: raining/i)).toBeInTheDocument()
    expect(scene).toHaveAttribute('data-weather', 'raining')
    expect(scene.querySelectorAll('.crowd-rain-drop').length).toBeGreaterThan(10)
    expect(screen.getByText(/currently overridden to raining/i)).toBeInTheDocument()
  })

  it('exposes simulation scene state for sunny mornings', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        weather: 'sunny',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [],
        },
      }),
    })

    const scene = screen.getByRole('img', { name: /simulation scene/i })

    expect(scene).toHaveAttribute('data-weather', 'sunny')
    expect(scene).toHaveAttribute('data-time-of-day', 'morning')
    expect(scene).toHaveAccessibleName(/sunny/i)
    expect(scene).toHaveAccessibleName(/8:00 am/i)
    expect(scene.querySelectorAll('.crowd-rain-drop')).toHaveLength(0)
  })

  it('exposes simulation scene state for rainy dusk', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        weather: 'raining',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [],
        },
      }),
    })

    act(() => {
      vi.advanceTimersByTime(6000)
    })

    const scene = screen.getByRole('img', { name: /simulation scene/i })

    expect(scene).toHaveAttribute('data-weather', 'raining')
    expect(scene).toHaveAttribute('data-time-of-day', 'dusk')
    expect(scene).toHaveAccessibleName(/raining/i)
    expect(scene).toHaveAccessibleName(/6:00 pm/i)
    expect(scene.querySelectorAll('.crowd-rain-drop').length).toBeGreaterThan(10)
  })

  it('adds extra cloud cover for cloudy simulations', () => {
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
      room: createHostRoom({}, {
        phase: 'simulating',
        weather: 'cloudy',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [],
        },
      }),
    })

    const scene = screen.getByRole('img', { name: /simulation scene/i })
    const clouds = [...scene.querySelectorAll('.crowd-cloud')] as HTMLElement[]

    expect(scene).toHaveAttribute('data-weather', 'cloudy')
    expect(clouds.length).toBeGreaterThanOrEqual(6)
    for (const cloud of clouds) {
      expect(Number.parseFloat(cloud.style.getPropertyValue('--cloud-top'))).toBeLessThan(22)
    }
  })

  it('keeps rendering customers late in the timeline when events spawn near the end', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T12:00:00.000Z'))

    const { container } = render(<App />)

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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [
            createSimulationEvent({
              spawnAt: 4_700,
              outcomeAt: 5_300,
              exitAt: 5_800,
              standStops: [
                {
                  playerId: 'player-host',
                  arriveAt: 5_100,
                  departAt: 5_300,
                },
              ],
            }),
          ],
        },
      }),
    })

    expect(container.querySelectorAll('.crowd-customer')).toHaveLength(0)

    act(() => {
      vi.advanceTimersByTime(5_400)
    })

    expect(screen.getByLabelText(/time: 5:00 pm/i)).toBeInTheDocument()
    expect(container.querySelectorAll('.crowd-customer')).toHaveLength(1)
  })

  it('uses different sprite variants for consecutive customers so they are easier to distinguish', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T12:00:00.000Z'))

    const { container } = render(<App />)

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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [
            createSimulationEvent({
              id: 'customer-0',
              customerId: 'customer-0',
              customerIndex: 0,
              spawnAt: 0,
              outcomeAt: 2_200,
              exitAt: 3_200,
              standStops: [
                {
                  playerId: 'player-host',
                  arriveAt: 1_000,
                  departAt: 2_200,
                },
              ],
            }),
            createSimulationEvent({
              id: 'customer-1',
              customerId: 'customer-1',
              customerIndex: 1,
              spawnAt: 0,
              outcomeAt: 2_200,
              exitAt: 3_200,
              standStops: [
                {
                  playerId: 'player-guest',
                  arriveAt: 1_000,
                  departAt: 2_200,
                },
              ],
            }),
          ],
        },
      }),
    })

    act(() => {
      vi.advanceTimersByTime(1_200)
    })

    const sprites = [...container.querySelectorAll('.customer-sprite')] as HTMLImageElement[]
    expect(sprites).toHaveLength(2)
    expect(sprites[0]?.getAttribute('src')).not.toBe(sprites[1]?.getAttribute('src'))
  })

  it('spreads customers across the stand width instead of stacking them at one stop point', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T12:00:00.000Z'))

    const { container } = render(<App />)

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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 6000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [
            createSimulationEvent({
              id: 'event-a',
              customerId: 'customer-a',
              customerIndex: 0,
              spawnAt: 0,
              outcomeAt: 1_900,
              exitAt: 2_800,
              standStops: [
                {
                  playerId: 'player-host',
                  arriveAt: 900,
                  departAt: 1_900,
                },
              ],
            }),
            createSimulationEvent({
              id: 'event-b',
              customerId: 'customer-b',
              customerIndex: 1,
              spawnAt: 0,
              outcomeAt: 1_900,
              exitAt: 2_800,
              standStops: [
                {
                  playerId: 'player-host',
                  arriveAt: 900,
                  departAt: 1_900,
                },
              ],
            }),
          ],
        },
      }),
    })

    act(() => {
      vi.advanceTimersByTime(1_100)
    })

    const customers = [...container.querySelectorAll('.crowd-customer')] as HTMLElement[]
    expect(customers).toHaveLength(2)
    expect(customers[0]?.style.left).not.toBe(customers[1]?.style.left)
  })

  it('keeps sold-out customers moving past the stand instead of pausing there', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-16T12:00:00.000Z'))

    const { container } = render(<App />)

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
      room: createHostRoom({}, {
        phase: 'simulating',
        simulation: {
          durationMs: 4000,
          simulationStartAt: Date.parse('2026-03-16T12:00:00.000Z'),
          customerEvents: [
            createSimulationEvent({
              outcome: 'soldOut',
              salePrice: 0,
              satisfaction: 0,
              outcomeAt: 900,
              exitAt: 1800,
              standStops: [
                {
                  playerId: 'player-host',
                  arriveAt: 900,
                  departAt: 900,
                },
              ],
            }),
          ],
        },
      }),
    })

    act(() => {
      vi.advanceTimersByTime(850)
    })

    const customer = container.querySelector('.crowd-customer') as HTMLElement
    const leftBeforePassThrough = Number.parseFloat(customer.style.left)

    act(() => {
      vi.advanceTimersByTime(200)
    })

    const leftAfterPassThrough = Number.parseFloat(customer.style.left)
    expect(leftAfterPassThrough).toBeGreaterThan(leftBeforePassThrough)
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
                  customersWon: 12,
                  customersSkipped: 3,
                  customersSoldOut: 1,
                }
              : {
                  cupsSold: 9,
                  revenue: 13.5,
                  satisfaction: 0.68,
                  reputationDelta: 1,
                  customersWon: 9,
                  customersSkipped: 6,
                  customersSoldOut: 0,
                },
          history:
            player.id === 'player-host'
              ? [
                  createHistoryEntry({
                    endingMoney: 28,
                    recipeSnapshot: {
                      lemons: 2,
                      sugar: 2,
                      ice: 3,
                    },
                  }),
                ]
              : [
                  createHistoryEntry({
                    revenue: 13.5,
                    purchaseCost: 5.5,
                    profit: 8,
                    endingMoney: 24.5,
                    reputationAfter: 51,
                    cupsSold: 9,
                    satisfaction: 0.68,
                    recipeSnapshot: {
                      lemons: 2,
                      sugar: 2,
                      ice: 2,
                    },
                  }),
                ],
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

  it('uses next day copy for singleplayer results', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /play single-player/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createSoloRoom(
        {
          dailyResults: {
            cupsSold: 12,
            revenue: 18,
            satisfaction: 0.79,
            reputationDelta: 4,
            customersWon: 12,
            customersSkipped: 3,
            customersSoldOut: 1,
          },
          history: [
            createHistoryEntry({
              endingMoney: 28,
              recipeSnapshot: {
                lemons: 2,
                sugar: 2,
                ice: 3,
              },
            }),
          ],
        },
        { phase: 'results' },
      ),
    })

    expect(screen.getByRole('button', { name: /^next day$/i })).toBeInTheDocument()
    expect(screen.getByText(/start the next day when you are ready/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request next day/i })).not.toBeInTheDocument()
  })

  it('shows a final multiplayer ending without a next-day button', () => {
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
        day: 14,
        runLengthDays: 14,
        isGameComplete: true,
        finalOutcome: {
          winnerPlayerIds: ['player-guest'],
          decidedBy: 'reputation',
        },
        players: createRoom().players.map((player) =>
          player.id === 'player-host'
            ? {
                ...player,
                money: 32,
                reputation: 56,
                dailyResults: {
                  cupsSold: 12,
                  revenue: 18,
                  satisfaction: 0.79,
                  reputationDelta: 4,
                  customersWon: 12,
                  customersSkipped: 3,
                  customersSoldOut: 1,
                },
              }
            : {
                ...player,
                money: 32,
                reputation: 61,
                dailyResults: {
                  cupsSold: 9,
                  revenue: 13.5,
                  satisfaction: 0.68,
                  reputationDelta: 1,
                  customersWon: 9,
                  customersSkipped: 6,
                  customersSoldOut: 0,
                },
              },
        ),
      }),
    })

    expect(screen.getByText(/run complete/i)).toBeInTheDocument()
    expect(screen.getByText(/blair wins.*reputation/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /request next day/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^next day$/i })).not.toBeInTheDocument()
  })

  it('switches the results chart with metric filter buttons', () => {
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
        players: createRoom().players.map((player, index) => ({
          ...player,
          dailyResults: {
            cupsSold: 10 - index,
            revenue: 18 - index * 4,
            satisfaction: 0.8 - index * 0.1,
            reputationDelta: 4 - index,
            customersWon: 10 - index,
            customersSkipped: 3 + index,
            customersSoldOut: index,
          },
          history: [
            createHistoryEntry({
              day: 1,
              revenue: 15 - index * 4,
              purchaseCost: 5,
              profit: 10 - index * 4,
              endingMoney: 24 + index,
              reputationAfter: 50 + index,
              cupsSold: 8 - index,
              satisfaction: 0.7 - index * 0.1,
              recipeSnapshot: {
                lemons: 1 + index * 0.5,
                sugar: 2,
                ice: 3 - index,
              },
            }),
            createHistoryEntry({
              day: 2,
              revenue: 18 - index * 4,
              purchaseCost: 6,
              profit: 12 - index * 4,
              endingMoney: 30 + index,
              reputationAfter: 54 + index,
              cupsSold: 10 - index,
              satisfaction: 0.8 - index * 0.1,
              recipeSnapshot: {
                lemons: 1.5 + index * 0.5,
                sugar: 2.5,
                ice: 2 - index,
              },
            }),
          ],
        })),
      }),
    })

    expect(screen.getByRole('heading', { name: /revenue over time/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /revenue \+ profit/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /revenue \+ profit/i }))
    expect(screen.getByRole('heading', { name: /revenue and profit over time/i })).toBeInTheDocument()
    expect(screen.getByText(/alex revenue/i)).toBeInTheDocument()
    expect(screen.getByText(/alex profit/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^money$/i }))
    expect(screen.getByRole('heading', { name: /money over time/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^satisfaction$/i }))
    expect(screen.getByRole('heading', { name: /satisfaction over time/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^profit$/i }))
    expect(screen.getByRole('heading', { name: /profit over time/i })).toBeInTheDocument()
  })

  it('shows a separate recipe chart and lets multiplayer players switch the visible history', () => {
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
        players: createRoom().players.map((player, index) => ({
          ...player,
          dailyResults: {
            cupsSold: 10 - index,
            revenue: 18 - index * 4,
            satisfaction: 0.8 - index * 0.1,
            reputationDelta: 4 - index,
            customersWon: 10 - index,
            customersSkipped: 3 + index,
            customersSoldOut: index,
          },
          history: [
            createHistoryEntry({
              day: 1,
              revenue: 15 - index * 4,
              profit: 10 - index * 4,
              endingMoney: 25 + index,
              reputationAfter: 50 + index,
              cupsSold: 8 - index,
              satisfaction: 0.7 - index * 0.1,
              recipeSnapshot: {
                lemons: 1 + index,
                sugar: 2,
                ice: 3 - index,
              },
            }),
            createHistoryEntry({
              day: 2,
              revenue: 18 - index * 4,
              profit: 12 - index * 4,
              endingMoney: 30 + index,
              reputationAfter: 54 + index,
              cupsSold: 10 - index,
              satisfaction: 0.8 - index * 0.1,
              recipeSnapshot: {
                lemons: 1.5 + index,
                sugar: 2.5,
                ice: 2 - index,
              },
            }),
          ],
        })),
      }),
    })

    expect(screen.getByRole('heading', { name: /recipe over time: alex/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /alex/i })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(screen.getByRole('button', { name: /blair/i }))

    expect(screen.getByRole('heading', { name: /recipe over time: blair/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /blair/i })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows an empty-state message when chart history is unavailable', () => {
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
          dailyResults: {
            cupsSold: 10,
            revenue: 18,
            satisfaction: 0.8,
            reputationDelta: 4,
            customersWon: 10,
            customersSkipped: 3,
            customersSoldOut: 0,
          },
          history: [],
        })),
      }),
    })

    expect(screen.getByText(/play another day to start building a trend line for this stand/i)).toBeInTheDocument()
    expect(screen.getByText(/play another day to start tracking recipe trends/i)).toBeInTheDocument()
  })

  it('shows a final singleplayer summary without a next-day button', () => {
    render(<App />)

    fireEvent.change(screen.getByLabelText(/your name/i), {
      target: { value: 'Alex' },
    })
    fireEvent.click(screen.getByRole('button', { name: /play single-player/i }))

    emitMessage({
      type: 'connected',
      roomId: 'ROOM-42',
      playerId: 'player-host',
      hostPlayerId: 'player-host',
    })
    emitMessage({
      type: 'room_state',
      room: createSoloRoom(
        {
          money: 47.25,
          reputation: 58,
          dailyResults: {
            cupsSold: 12,
            revenue: 18,
            satisfaction: 0.79,
            reputationDelta: 4,
            customersWon: 12,
            customersSkipped: 3,
            customersSoldOut: 1,
          },
        },
        {
          phase: 'results',
          day: 14,
          runLengthDays: 14,
          isGameComplete: true,
          finalOutcome: {
            winnerPlayerIds: ['player-host'],
            decidedBy: 'money',
          },
        },
      ),
    })

    expect(screen.getByText(/run complete/i)).toBeInTheDocument()
    expect(screen.getAllByText(/final cash/i).length).toBeGreaterThan(0)
    expect(screen.getByLabelText('Final Cash: $47.25')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^next day$/i })).not.toBeInTheDocument()
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
    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'join_room',
        roomId: 'ROOM-42',
        name: 'Blair',
        faction: MARKET_FACTION,
        playerId: 'player-guest',
        analyticsPlayerId: expect.any(String),
      }),
    )
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

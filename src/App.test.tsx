import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App, { SAVE_KEY } from './App'
import { getCardDefinition } from './game/cards'
import { applyEvening, buyIngredients, createNewGame, generateDraft, resolveDay, saveGame, setStrategy } from './game/engine'
import type { GameState } from './game/types'

function persistState(state: GameState): void {
  window.localStorage.setItem(SAVE_KEY, JSON.stringify(saveGame(state)))
}

function buildEveningState(): GameState {
  return applyEvening(
    resolveDay(
      setStrategy(
        buyIngredients(
          {
            ...createNewGame({ seed: 41 }),
            money: 100,
            market: {
              lemons: 0.5,
              sugar: 0.2,
              ice: 0.1,
            },
          },
          {
            lemons: 18,
            sugar: 18,
            ice: 18,
          },
        ),
        {
          recipe: {
            lemons: 2,
            sugar: 2,
            ice: 2,
          },
          price: 1.6,
        },
      ),
    ),
  )
}

function buildDayState(): GameState {
  return resolveDay(
    setStrategy(
      buyIngredients(
        {
          ...createNewGame({ seed: 41 }),
          money: 100,
          market: {
            lemons: 0.5,
            sugar: 0.2,
            ice: 0.1,
          },
        },
        {
          lemons: 18,
          sugar: 18,
          ice: 18,
        },
      ),
      {
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
        price: 1.6,
      },
    ),
  )
}

function buildMorningState(): GameState {
  return {
    ...createNewGame({ seed: 12 }),
    money: 100,
    inventory: {
      lemons: 4,
      sugar: 4,
      ice: 4,
    },
    market: {
      lemons: 0.5,
      sugar: 0.2,
      ice: 0.1,
    },
  }
}

function buildPlaybackInventoryState(): GameState {
  return resolveDay(
    setStrategy(
      buyIngredients(
        {
          ...createNewGame({ seed: 5 }),
          money: 100,
          market: {
            lemons: 0.5,
            sugar: 0.2,
            ice: 0.1,
          },
        },
        {
          lemons: 12,
          sugar: 12,
          ice: 12,
        },
      ),
      {
        recipe: {
          lemons: 2,
          sugar: 2,
          ice: 2,
        },
        price: 0.5,
      },
    ),
  )
}

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('enters the visible day phase after the morning flow', async () => {
    vi.useFakeTimers()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /run day/i }))

    expect(screen.getByRole('heading', { name: /day rush/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/business clock/i)).toHaveTextContent('8:00 AM')
  })

  it('auto-advances from the day phase into evening results', async () => {
    vi.useFakeTimers()
    render(<App />)

    fireEvent.click(screen.getByRole('button', { name: /run day/i }))

    await act(async () => {
      vi.advanceTimersByTime(9800)
    })

    expect(screen.getByRole('heading', { name: /evening results/i })).toBeInTheDocument()
    expect(screen.getByText(/cups sold/i)).toBeInTheDocument()
  })

  it('advances the day clock during playback', async () => {
    vi.useFakeTimers()
    persistState(buildDayState())

    render(<App />)

    expect(screen.getByLabelText(/business clock/i)).toHaveTextContent('8:00 AM')

    await act(async () => {
      vi.advanceTimersByTime(4500)
    })

    expect(screen.getByLabelText(/business clock/i)).toHaveTextContent('1:00 PM')
  })

  it('shows dev controls and resets the current run', () => {
    persistState(buildEveningState())

    render(<App />)

    expect(screen.getByRole('heading', { name: /dev tools/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /reset current run/i }))

    expect(screen.getByRole('heading', { name: /morning setup/i })).toBeInTheDocument()
    expect(window.localStorage.getItem(SAVE_KEY)).not.toBeNull()
    expect(screen.getByText(/forecast:/i)).toBeInTheDocument()
  })

  it('applies the dev simulation speed control to day playback', async () => {
    vi.useFakeTimers()
    persistState(buildDayState())

    render(<App />)

    fireEvent.change(screen.getByLabelText(/simulation speed/i), {
      target: {
        value: '0.5',
      },
    })

    await act(async () => {
      vi.advanceTimersByTime(4500)
    })

    expect(screen.getByLabelText(/business clock/i)).toHaveTextContent('10:30 AM')
  })

  it('shows sellable cups now and after the staged shopping basket', () => {
    persistState(buildMorningState())

    render(<App />)

    expect(screen.getByText(/sellable cups/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/current inventory: 2 cups/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/after shopping: 2 cups/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/buy lemons/i), {
      target: {
        value: '2',
      },
    })
    fireEvent.change(screen.getByLabelText(/buy sugar/i), {
      target: {
        value: '2',
      },
    })
    fireEvent.change(screen.getByLabelText(/buy ice/i), {
      target: {
        value: '2',
      },
    })

    expect(screen.getByLabelText(/after shopping: 3 cups/i)).toBeInTheDocument()
  })

  it('reports opening inventory first and reduces it during day playback', async () => {
    vi.useFakeTimers()
    persistState(buildPlaybackInventoryState())

    render(<App />)

    const appWindow = window as Window & {
      render_game_to_text?: () => string
    }

    const openingSnapshot = JSON.parse(appWindow.render_game_to_text?.() ?? '{}')

    expect(openingSnapshot.inventory).toEqual({
      lemons: 12,
      sugar: 12,
      ice: 12,
    })

    await act(async () => {
      vi.advanceTimersByTime(4500)
    })

    const midDaySnapshot = JSON.parse(appWindow.render_game_to_text?.() ?? '{}')

    expect(midDaySnapshot.inventory.lemons).toBeLessThan(12)
    expect(midDaySnapshot.inventory.sugar).toBeLessThan(12)
    expect(midDaySnapshot.inventory.ice).toBeLessThan(12)
  })

  it('disables unaffordable paid cards in the night draft', () => {
    const nightState = generateDraft({
      ...buildEveningState(),
      phase: 'evening',
      money: 0,
    })
    persistState(nightState)

    render(<App />)

    const paidCards = nightState.draftOptions
      .map((cardId) => getCardDefinition(cardId))
      .filter((card) => card.cost > 0)

    expect(paidCards.length).toBeGreaterThan(0)

    paidCards.forEach((card) => {
      expect(screen.getByRole('button', { name: new RegExp(`pick ${card.name}`, 'i') })).toBeDisabled()
    })
  })

  it('renders the evening breakdown from a saved run', () => {
    persistState(buildEveningState())

    render(<App />)

    expect(screen.getByRole('heading', { name: /evening results/i })).toBeInTheDocument()
    expect(screen.getByText(/reputation change/i)).toBeInTheDocument()
  })

  it('resumes from a saved run instead of starting fresh', () => {
    const savedNight = generateDraft(buildEveningState())
    persistState(savedNight)

    render(<App />)

    expect(screen.getByRole('heading', { name: /night market/i })).toBeInTheDocument()
    expect(screen.getByText(/choose one upgrade/i)).toBeInTheDocument()
  })

  it('replays a saved day state and completes into evening', async () => {
    vi.useFakeTimers()
    persistState(buildDayState())

    render(<App />)

    expect(screen.getByRole('heading', { name: /day rush/i })).toBeInTheDocument()

    await act(async () => {
      vi.advanceTimersByTime(9800)
    })

    expect(screen.getByRole('heading', { name: /evening results/i })).toBeInTheDocument()
  })

  it('shows days survived first on the game over summary', () => {
    const gameOverState = {
      ...buildEveningState(),
      phase: 'gameOver' as const,
      day: 7,
      money: -2,
    }
    persistState(gameOverState)

    render(<App />)

    expect(screen.getByRole('heading', { name: /stand closed/i })).toBeInTheDocument()
    expect(screen.getByText(/days survived/i)).toBeInTheDocument()
  })
})

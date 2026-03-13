import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'

import App, { SAVE_KEY } from './App'
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

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('runs the morning flow into evening results', async () => {
    const user = userEvent.setup()
    render(<App />)

    await user.clear(screen.getByLabelText(/buy lemons/i))
    await user.type(screen.getByLabelText(/buy lemons/i), '6')
    await user.clear(screen.getByLabelText(/buy sugar/i))
    await user.type(screen.getByLabelText(/buy sugar/i), '6')
    await user.clear(screen.getByLabelText(/buy ice/i))
    await user.type(screen.getByLabelText(/buy ice/i), '6')
    await user.clear(screen.getByLabelText(/lemons per cup/i))
    await user.type(screen.getByLabelText(/lemons per cup/i), '2')
    await user.clear(screen.getByLabelText(/sugar per cup/i))
    await user.type(screen.getByLabelText(/sugar per cup/i), '2')
    await user.clear(screen.getByLabelText(/^ice per cup$/i))
    await user.type(screen.getByLabelText(/^ice per cup$/i), '2')
    await user.clear(screen.getByLabelText(/price per cup/i))
    await user.type(screen.getByLabelText(/price per cup/i), '1.50')
    await user.click(screen.getByRole('button', { name: /run day/i }))

    expect(await screen.findByRole('heading', { name: /evening results/i })).toBeInTheDocument()
    expect(screen.getByText(/cups sold/i)).toBeInTheDocument()
  })

  it('disables unaffordable paid cards in the night draft', () => {
    const nightState = generateDraft({
      ...buildEveningState(),
      phase: 'evening',
      money: 0,
    })
    persistState(nightState)

    render(<App />)

    expect(screen.getByRole('button', { name: /pick merchandising/i })).toBeDisabled()
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

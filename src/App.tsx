import { startTransition, useEffect, useState } from 'react'
import type { JSX } from 'react'

import './App.css'
import { defaultBalanceConfig } from './game/balance'
import { getCardDefinition } from './game/cards'
import {
  applyEvening,
  buyIngredients,
  createNewGame,
  generateDraft,
  loadGame,
  pickCard,
  resolveDay,
  saveGame,
  setStrategy,
  skipDraft,
} from './game/engine'
import type { CardId, DailyReport, GameState, Inventory, Recipe } from './game/types'

export const SAVE_KEY = 'roguelike-lemonade-stand-save-v1'

interface MorningForm {
  purchases: Inventory
  recipe: Recipe
  price: number
}

function emptyInventory(): Inventory {
  return {
    lemons: 0,
    sugar: 0,
    ice: 0,
  }
}

function createMorningForm(state: GameState): MorningForm {
  return {
    purchases: emptyInventory(),
    recipe: state.plan.recipe,
    price: state.plan.price,
  }
}

function readStoredGame(): GameState {
  const stored = window.localStorage.getItem(SAVE_KEY)

  if (stored === null) {
    return createNewGame()
  }

  try {
    const parsed = JSON.parse(stored)
    const loaded = loadGame(parsed)
    return loaded ?? createNewGame()
  } catch {
    return createNewGame()
  }
}

function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatSignedValue(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value}`
}

function purchaseCost(market: GameState['market'], purchases: Inventory): number {
  if (market === null) {
    return 0
  }

  return Number(
    (
      purchases.lemons * market.lemons +
      purchases.sugar * market.sugar +
      purchases.ice * market.ice
    ).toFixed(2),
  )
}

function ingredientCostPerCup(market: GameState['market'], recipe: Recipe): number {
  if (market === null) {
    return 0
  }

  return Number(
    (
      recipe.lemons * market.lemons +
      recipe.sugar * market.sugar +
      recipe.ice * market.ice
    ).toFixed(2),
  )
}

function weatherLabel(state: GameState): string {
  if (state.weather === null) {
    return 'Forecast pending'
  }

  return defaultBalanceConfig.weatherProfiles[state.weather].label
}

function idealRecipeText(state: GameState): string {
  if (state.weather === null) {
    return 'No weather data yet.'
  }

  const ideal = defaultBalanceConfig.weatherProfiles[state.weather].idealRecipe
  return `${ideal.lemons} lemon, ${ideal.sugar} sugar, ${ideal.ice} ice`
}

function numberValue(input: string): number {
  if (input.trim() === '') {
    return 0
  }

  return Number(input)
}

function MetricCard({
  label,
  value,
  accent = false,
}: {
  label: string
  value: string
  accent?: boolean
}): JSX.Element {
  return (
    <article className={`metric-card${accent ? ' metric-card-accent' : ''}`}>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
    </article>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min: number
  max?: number
  step?: number
  onChange: (nextValue: number) => void
}): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className="field-input"
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(numberValue(event.target.value))}
      />
    </label>
  )
}

function HintList(): JSX.Element {
  return (
    <section className="panel hint-panel">
      <p className="eyebrow">Stand wisdom</p>
      <h3>How to stay alive</h3>
      <ul className="notes-list">
        <li>Hot days love ice. Rainy days tolerate richer recipes.</li>
        <li>Rent lands every 5 days, and it scales up fast after each payment.</li>
        <li>Some cards want you to build a reputation empire. Others dare you to cash it in.</li>
      </ul>
    </section>
  )
}

function ActiveCardsPanel({ state }: { state: GameState }): JSX.Element {
  return (
    <section className="panel">
      <p className="eyebrow">Active cards</p>
      <h3>Current build</h3>
      {state.activeCards.length === 0 ? (
        <p className="muted">No modifiers yet. Night markets are where things get weird.</p>
      ) : (
        <ul className="card-stack">
          {state.activeCards.map((activeCard) => {
            const definition = getCardDefinition(activeCard.id)
            const duration =
              activeCard.remainingDays === undefined ? 'Permanent' : `${activeCard.remainingDays} day(s) left`

            return (
              <li className="mini-card" key={`${activeCard.id}-${activeCard.draftedOnDay}`}>
                <div>
                  <strong>{definition.name}</strong>
                  <p>{definition.description}</p>
                </div>
                <span className="mini-tag">{duration}</span>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

function MorningScreen({
  state,
  onRunDay,
  error,
}: {
  state: GameState
  onRunDay: (form: MorningForm) => void
  error: string | null
}): JSX.Element {
  const [form, setForm] = useState<MorningForm>(() => createMorningForm(state))
  const spend = purchaseCost(state.market, form.purchases)
  const cupCost = ingredientCostPerCup(state.market, form.recipe)
  const canAfford = spend <= state.money
  const forecast = weatherLabel(state)

  return (
    <section className="phase-shell">
      <div className="panel phase-header">
        <div>
          <p className="eyebrow">Morning setup</p>
          <h2>Morning Setup</h2>
          <p className="muted">
            Forecast: <strong>{forecast}</strong>. Ideal crowd-pleaser: {idealRecipeText(state)}.
          </p>
        </div>
        <div className="summary-chip-row">
          <span className="summary-chip">Spend plan {formatMoney(spend)}</span>
          <span className="summary-chip">Cup cost {formatMoney(cupCost)}</span>
        </div>
      </div>

      <div className="phase-grid">
        <section className="panel">
          <p className="eyebrow">Market</p>
          <h3>Buy ingredients</h3>
          <div className="market-grid">
            <MetricCard label="Lemons" value={`${formatMoney(state.market?.lemons ?? 0)} each`} />
            <MetricCard label="Sugar" value={`${formatMoney(state.market?.sugar ?? 0)} each`} />
            <MetricCard label="Ice" value={`${formatMoney(state.market?.ice ?? 0)} each`} />
          </div>
          <div className="field-grid">
            <NumberField
              label="Buy Lemons"
              value={form.purchases.lemons}
              min={0}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  purchases: {
                    ...current.purchases,
                    lemons: value,
                  },
                }))
              }
            />
            <NumberField
              label="Buy Sugar"
              value={form.purchases.sugar}
              min={0}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  purchases: {
                    ...current.purchases,
                    sugar: value,
                  },
                }))
              }
            />
            <NumberField
              label="Buy Ice"
              value={form.purchases.ice}
              min={0}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  purchases: {
                    ...current.purchases,
                    ice: value,
                  },
                }))
              }
            />
          </div>
        </section>

        <section className="panel">
          <p className="eyebrow">Recipe</p>
          <h3>Set the pitch</h3>
          <div className="field-grid">
            <NumberField
              label="Lemons per Cup"
              value={form.recipe.lemons}
              min={0}
              max={5}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  recipe: {
                    ...current.recipe,
                    lemons: value,
                  },
                }))
              }
            />
            <NumberField
              label="Sugar per Cup"
              value={form.recipe.sugar}
              min={0}
              max={5}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  recipe: {
                    ...current.recipe,
                    sugar: value,
                  },
                }))
              }
            />
            <NumberField
              label="Ice per Cup"
              value={form.recipe.ice}
              min={0}
              max={5}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  recipe: {
                    ...current.recipe,
                    ice: value,
                  },
                }))
              }
            />
            <NumberField
              label="Price per Cup"
              value={form.price}
              min={0}
              step={0.05}
              onChange={(value) =>
                setForm((current) => ({
                  ...current,
                  price: value,
                }))
              }
            />
          </div>
          <div className="action-row">
            <button
              className="action-button action-button-primary"
              disabled={!canAfford}
              onClick={() => onRunDay(form)}
            >
              Run Day
            </button>
            <p className="muted">
              {canAfford
                ? 'You are good to go.'
                : 'Your shopping list costs more than your cash box.'}
            </p>
          </div>
          {error !== null ? <p className="error-text">{error}</p> : null}
        </section>
      </div>
    </section>
  )
}

function EveningScreen({
  report,
  onOpenShop,
}: {
  report: DailyReport
  onOpenShop: () => void
}): JSX.Element {
  return (
    <section className="phase-shell">
      <div className="panel phase-header">
        <div>
          <p className="eyebrow">Evening results</p>
          <h2>Evening Results</h2>
          <p className="muted">Today&apos;s weather was {defaultBalanceConfig.weatherProfiles[report.weather].label}.</p>
        </div>
        <button className="action-button action-button-primary" onClick={onOpenShop}>
          Open Night Shop
        </button>
      </div>

      <div className="report-grid">
        <MetricCard label="Cups Sold" value={`${report.cupsSold}`} accent />
        <MetricCard label="Revenue" value={formatMoney(report.revenue)} />
        <MetricCard label="Free Sales" value={`${report.freeSales}`} />
        <MetricCard label="Reputation Change" value={formatSignedValue(report.reputationChange)} />
        <MetricCard label="Rent Paid" value={report.rentTriggered ? formatMoney(report.rentPaid) : 'Not due'} />
        <MetricCard label="Spoiled Ice" value={`${report.spoilage.ice}`} />
      </div>

      <div className="phase-grid">
        <section className="panel">
          <p className="eyebrow">Breakdown</p>
          <h3>Customer reaction</h3>
          <ul className="notes-list">
            <li>Potential customers: {report.potentialCustomers}</li>
            <li>Average satisfaction: {(report.averageSatisfaction * 100).toFixed(0)}%</li>
            <li>Premium sales: {report.premiumSales}</li>
            <li>Money after rent: {formatMoney(report.moneyAfterRent)}</li>
          </ul>
        </section>

        <section className="panel">
          <p className="eyebrow">Notes</p>
          <h3>What changed tonight</h3>
          {report.notes.length === 0 ? (
            <p className="muted">A clean day. No special card hooks fired this evening.</p>
          ) : (
            <ul className="notes-list">
              {report.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </section>
  )
}

function NightScreen({
  state,
  onPick,
  onSkip,
}: {
  state: GameState
  onPick: (cardId: CardId) => void
  onSkip: () => void
}): JSX.Element {
  const affordableCards = state.draftOptions.filter((cardId) => getCardDefinition(cardId).cost <= state.money)

  return (
    <section className="phase-shell">
      <div className="panel phase-header">
        <div>
          <p className="eyebrow">Night market</p>
          <h2>Night Market</h2>
          <p className="muted">Choose one upgrade. Three offers, one pick, and tomorrow&apos;s whole economy tilts around it.</p>
        </div>
        <button className="action-button action-button-secondary" onClick={onSkip}>
          Skip tonight
        </button>
      </div>

      <div className="draft-grid">
        {state.draftOptions.map((cardId) => {
          const card = getCardDefinition(cardId)
          const disabled = card.cost > state.money

          return (
            <article className={`draft-card${disabled ? ' draft-card-disabled' : ''}`} key={card.id}>
              <div className="draft-head">
                <p className="eyebrow">{card.category}</p>
                <span className="mini-tag">{formatMoney(card.cost)}</span>
              </div>
              <h3>{card.name}</h3>
              <p className="muted">{card.description}</p>
              <button
                className="action-button action-button-primary"
                disabled={disabled}
                onClick={() => onPick(card.id)}
              >
                Pick {card.name}
              </button>
            </article>
          )
        })}
      </div>

      {affordableCards.length === 0 ? (
        <p className="muted centered-text">Nothing is in budget tonight, so skipping is the safe play.</p>
      ) : null}
    </section>
  )
}

function GameOverScreen({
  state,
  onRestart,
}: {
  state: GameState
  onRestart: () => void
}): JSX.Element {
  return (
    <section className="phase-shell">
      <div className="panel game-over-panel">
        <p className="eyebrow">Stand closed</p>
        <h2>Stand Closed</h2>
        <p className="muted">The rent finally won.</p>
        <div className="report-grid">
          <MetricCard label="Days Survived" value={`${state.day}`} accent />
          <MetricCard label="Final Cash" value={formatMoney(state.money)} />
          <MetricCard label="Reputation" value={`${state.reputation}`} />
        </div>
        <p className="muted">
          {state.lastReport === null
            ? 'The books went red before the next sunrise.'
            : `Last rent paid: ${formatMoney(state.lastReport.rentPaid)}. You were ${formatMoney(
                Math.abs(state.money),
              )} short.`}
        </p>
        <button className="action-button action-button-primary" onClick={onRestart}>
          Start New Run
        </button>
      </div>
    </section>
  )
}

function App(): JSX.Element {
  const [state, setState] = useState<GameState>(() => readStoredGame())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(saveGame(state)))
  }, [state])

  const runDay = (form: MorningForm): void => {
    try {
      setError(null)
      startTransition(() => {
        setState((current) => {
          if (current.phase !== 'morning') {
            return current
          }

          const prepared = setStrategy(
            buyIngredients(current, form.purchases),
            {
              recipe: form.recipe,
              price: form.price,
            },
          )

          return applyEvening(resolveDay(prepared))
        })
      })
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Could not run the day.')
    }
  }

  const openShop = (): void => {
    setError(null)
    startTransition(() => {
      setState((current) => generateDraft(current))
    })
  }

  const chooseCard = (cardId: CardId): void => {
    setError(null)
    startTransition(() => {
      setState((current) => pickCard(current, cardId))
    })
  }

  const passTonight = (): void => {
    setError(null)
    startTransition(() => {
      setState((current) => skipDraft(current))
    })
  }

  const restart = (): void => {
    setError(null)
    startTransition(() => {
      setState(createNewGame())
    })
  }

  const lastReport = state.lastReport

  return (
    <main className="app-shell">
      <header className="hero-banner">
        <div className="hero-copy">
          <p className="eyebrow">Roguelike Lemonade Stand</p>
          <h1>Build a citrus empire before the rent curve crushes it.</h1>
          <p className="hero-text">
            Each day is a tiny business sim. Each night is a crooked little deckbuilder. Survive as long as you can.
          </p>
        </div>
        <div className="hero-metrics">
          <MetricCard label="Day" value={`${state.day}`} accent />
          <MetricCard label="Money" value={formatMoney(state.money)} />
          <MetricCard label="Rent" value={formatMoney(state.rent)} />
          <MetricCard label="Rent Due In" value={`${state.rentTimer} day(s)`} />
          <MetricCard label="Reputation" value={`${state.reputation}`} />
          <MetricCard label="Forecast" value={weatherLabel(state)} />
        </div>
      </header>

      <section className="dashboard-grid">
        <div className="main-column">
          {state.phase === 'morning' ? (
            <MorningScreen key={`morning-${state.day}`} state={state} onRunDay={runDay} error={error} />
          ) : null}
          {state.phase === 'evening' && lastReport !== null ? (
            <EveningScreen report={lastReport} onOpenShop={openShop} />
          ) : null}
          {state.phase === 'night' ? (
            <NightScreen state={state} onPick={chooseCard} onSkip={passTonight} />
          ) : null}
          {state.phase === 'gameOver' ? <GameOverScreen state={state} onRestart={restart} /> : null}
        </div>

        <aside className="side-column">
          <section className="panel">
            <p className="eyebrow">Inventory</p>
            <h3>What&apos;s on hand</h3>
            <div className="market-grid">
              <MetricCard label="Lemons" value={`${state.inventory.lemons}`} />
              <MetricCard label="Sugar" value={`${state.inventory.sugar}`} />
              <MetricCard label="Ice" value={`${state.inventory.ice}`} />
            </div>
          </section>
          <ActiveCardsPanel state={state} />
          <HintList />
        </aside>
      </section>
    </main>
  )
}

export default App

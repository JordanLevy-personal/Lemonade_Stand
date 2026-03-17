import { startTransition, useEffect, useState } from 'react'
import type { JSX } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

import './App.css'
import { defaultBalanceConfig } from './game/balance'
import { getCardDefinition } from './game/cards'
import {
  applyEvening,
  buyIngredients,
  calculateInventoryAfterSales,
  calculateOpeningInventory,
  calculateSellableCups,
  createNewGame,
  generateDraft,
  loadGame,
  pickCard,
  resolveDay,
  saveGame,
  setStrategy,
  skipDraft,
} from './game/engine'
import type { CardId, CustomerVisit, DailyReport, GameState, Inventory, Recipe } from './game/types'

import CardClockIcon from './assets/cards/card_clock.png'
import CardLemonIcon from './assets/cards/card_lemon.png'
import Customer1Sprite from './assets/customers/customer_1.png'
import Customer2Sprite from './assets/customers/customer_2.png'
import StandSprite from './assets/stand.png'
import StandTier1Sprite from './assets/stand_tier_1.png'
import StandTier3Sprite from './assets/stand_tier_3.png'


export const SAVE_KEY = 'roguelike-lemonade-stand-save-v1'
const IS_DEV = import.meta.env.DEV

const DAY_PLAYBACK_MS = 9_000
const DAY_TRANSITION_DELAY_MS = 400
const DAY_TICK_MS = 100
const BUSINESS_DAY_START_MINUTES = 8 * 60
const BUSINESS_DAY_END_MINUTES = 18 * 60
const CUSTOMER_TRAVEL_WINDOW = 0.22
const CUSTOMER_DECISION_OFFSET = 0.08
const CUSTOMER_INDICATOR_WINDOW = 0.08
const DEFAULT_SIMULATION_SPEED = 1
const SIMULATION_SPEED_OPTIONS = [0.5, 0.75, 1, 1.5, 2]

interface MorningForm {
  purchases: Inventory
  recipe: Recipe
  price: number
}

interface SceneCustomer extends CustomerVisit {
  visible: boolean
  showIndicator: boolean
  xPercent: number
  laneOffsetRem: number
  isPaused: boolean
}

function emptyInventory(): Inventory {
  return {
    lemons: 0,
    sugar: 0,
    ice: 0,
  }
}

function addInventories(left: Inventory, right: Inventory): Inventory {
  return {
    lemons: left.lemons + right.lemons,
    sugar: left.sugar + right.sugar,
    ice: left.ice + right.ice,
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

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value))
}

function playbackProgress(playbackMs: number): number {
  return clamp(playbackMs / DAY_PLAYBACK_MS, 0, 1)
}

function formatClockTime(progress: number): string {
  const dayMinutes = BUSINESS_DAY_END_MINUTES - BUSINESS_DAY_START_MINUTES
  const elapsedMinutes =
    progress >= 1 ? dayMinutes : Math.floor(dayMinutes * clamp(progress, 0, 1))
  const totalMinutes = BUSINESS_DAY_START_MINUTES + elapsedMinutes
  const hour24 = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const suffix = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12

  return `${hour12}:${minutes.toString().padStart(2, '0')} ${suffix}`
}

function visitExitProgress(visit: CustomerVisit): number {
  return clamp(visit.arrivalProgress + CUSTOMER_TRAVEL_WINDOW, 0, 1)
}

function visitDecisionWindow(visit: CustomerVisit): {
  start: number
  end: number
} {
  const exit = visitExitProgress(visit)
  const start = Math.min(exit, visit.arrivalProgress + CUSTOMER_DECISION_OFFSET)

  return {
    start,
    end: Math.min(exit, start + CUSTOMER_INDICATOR_WINDOW),
  }
}

function sceneCustomer(visit: CustomerVisit, progress: number): SceneCustomer {
  const exit = visitExitProgress(visit)
  const visible = progress >= visit.arrivalProgress && progress <= exit
  const travelRatio = visible ? (progress - visit.arrivalProgress) / Math.max(exit - visit.arrivalProgress, 0.001) : 0
  const decisionWindow = visitDecisionWindow(visit)

  // Target a varied "center" for each customer so they don't overlap perfectly
  const pauseCenterRatio = 0.42 + (Math.abs(Math.sin(visit.customerIndex * 4321.1)) * 0.16) // center is between 0.42 to 0.58 of path

  // Use the same time window for pausing (40% to 60% of their journey)
  const startPauseTime = 0.4
  const endPauseTime = 0.6

  let tweakedRatio = travelRatio
  if (travelRatio < startPauseTime) {
    // 0 to pause point
    tweakedRatio = travelRatio * (pauseCenterRatio / startPauseTime)
  } else if (travelRatio < endPauseTime) {
    // pause at pseudo-random center
    tweakedRatio = pauseCenterRatio
  } else {
    // pause point to 1.0
    tweakedRatio = pauseCenterRatio + ((travelRatio - endPauseTime) * ((1.0 - pauseCenterRatio) / (1.0 - endPauseTime)))
  }

  return {
    ...visit,
    visible,
    showIndicator: progress >= decisionWindow.start && progress <= decisionWindow.end,
    xPercent: 105 - tweakedRatio * 118,
    laneOffsetRem: (visit.customerIndex % 3) * 0.28,
    isPaused: travelRatio >= 0.4 && travelRatio < 0.6,
  }
}

function visitsResolvedByProgress(visits: CustomerVisit[], progress: number): CustomerVisit[] {
  return visits.filter((visit) => progress >= visitDecisionWindow(visit).start)
}

function formatSimulationSpeed(value: number): string {
  return `${value}x`
}

function formatCupCapacity(count: number): string {
  if (!Number.isFinite(count)) {
    return 'Unlimited'
  }

  return `${count} cup${count === 1 ? '' : 's'}`
}

function formatCupDelta(current: number, projected: number): string {
  if (!Number.isFinite(projected)) {
    return Number.isFinite(current) ? 'Unlimited after shopping' : 'Still unlimited'
  }

  if (!Number.isFinite(current)) {
    return 'Already unlimited'
  }

  const delta = Math.max(0, projected - current)
  return delta === 0 ? 'No extra cups' : `+${formatCupCapacity(delta)}`
}

function displayInventory(state: GameState, playbackMs: number): Inventory {
  if (state.phase !== 'day' || state.pendingReport === null) {
    return state.inventory
  }

  const progress = playbackProgress(playbackMs)
  const resolvedVisits = visitsResolvedByProgress(state.pendingReport.customerVisits, progress)
  const resolvedSales = resolvedVisits.filter((visit) => visit.outcome === 'buy').length
  const openingInventory = calculateOpeningInventory(
    state.inventory,
    state.plan.recipe,
    state.pendingReport.cupsSold,
  )

  return calculateInventoryAfterSales(openingInventory, state.plan.recipe, resolvedSales)
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
    <article className={`metric-card${accent ? ' metric-card-accent' : ''}`} aria-label={`${label}: ${value}`}>
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

function RangeSliderField({
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
  max: number
  step?: number
  onChange: (nextValue: number) => void
}): JSX.Element {
  return (
    <label className="field">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="field-label">{label}</span>
        <strong className="metric-value" style={{ fontSize: '1.2rem' }}>{Number.isInteger(step) ? value : value.toFixed(1)}</strong>
      </div>
      <input
        className="field-slider"
        type="range"
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

function DevToolsPanel({
  simulationSpeed,
  onSimulationSpeedChange,
  onResetRun,
}: {
  simulationSpeed: number
  onSimulationSpeedChange: (nextValue: number) => void
  onResetRun: () => void
}): JSX.Element {
  return (
    <section className="panel">
      <p className="eyebrow">Dev tools</p>
      <h3>Dev Tools</h3>
      <div className="field-grid">
        <label className="field" htmlFor="simulation-speed">
          <span className="field-label">Simulation Speed</span>
          <select
            className="field-input"
            id="simulation-speed"
            value={simulationSpeed}
            onChange={(event) => onSimulationSpeedChange(Number(event.target.value))}
          >
            {SIMULATION_SPEED_OPTIONS.map((speed) => (
              <option key={speed} value={speed}>
                {formatSimulationSpeed(speed)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="action-row">
        <button className="action-button action-button-secondary" onClick={onResetRun}>
          Reset Current Run
        </button>
        <p className="muted">Clears the saved run and starts a fresh day-one state.</p>
      </div>
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
  const currentCupCapacity = calculateSellableCups(state.inventory, form.recipe)
  const projectedCupCapacity = calculateSellableCups(
    addInventories(state.inventory, form.purchases),
    form.recipe,
  )

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

      <section className="panel sales-forecast-panel">
        <div className="phase-header">
          <div>
            <p className="eyebrow">Sales forecast</p>
            <h3>Sellable cups</h3>
          </div>
          <span className="summary-chip">Projected stock {formatCupCapacity(projectedCupCapacity)}</span>
        </div>
        <div className="forecast-grid">
          <MetricCard label="Current Inventory" value={formatCupCapacity(currentCupCapacity)} accent />
          <MetricCard label="After Shopping" value={formatCupCapacity(projectedCupCapacity)} />
          <MetricCard label="Extra Capacity" value={formatCupDelta(currentCupCapacity, projectedCupCapacity)} />
        </div>
        <p className="forecast-copy">
          <strong>{formatCupCapacity(currentCupCapacity)}</strong> from current inventory.{' '}
          <strong>{formatCupCapacity(projectedCupCapacity)}</strong> after shopping.
        </p>
      </section>

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
            <RangeSliderField
              label="Lemons per Cup"
              value={form.recipe.lemons}
              min={0}
              max={5}
              step={0.1}
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
            <RangeSliderField
              label="Sugar per Cup"
              value={form.recipe.sugar}
              min={0}
              max={5}
              step={0.1}
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
            <RangeSliderField
              label="Ice per Cup"
              value={form.recipe.ice}
              min={0}
              max={5}
              step={0.1}
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
  history,
  onOpenShop,
}: {
  report: DailyReport
  history: DailyReport[]
  onOpenShop: () => void
}): JSX.Element {
  const chartData = history.map((h, i) => {
    const previousMoney = i === 0 ? defaultBalanceConfig.startingMoney : history[i - 1].moneyAfterRent
    const profit = h.moneyAfterRent - previousMoney
    return { ...h, profit }
  })

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
        <section className="panel chart-panel">
          <p className="eyebrow">Trends</p>
          <h3>Revenue & Profit</h3>
          <div style={{ width: '100%', height: 180, marginTop: '1rem' }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="day" hide />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip 
                  formatter={(value: any) => formatMoney(Number(value) || 0)}
                  labelFormatter={(day: any) => `Day ${Number(day) || 0}`}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                />
                <Line type="monotone" dataKey="revenue" name="Revenue" stroke="#e5ae1f" strokeWidth={3} dot={false} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#6ab04c" strokeWidth={3} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>

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

function DayScreen({
  state,
  playbackMs,
}: {
  state: GameState
  playbackMs: number
}): JSX.Element {
  const report = state.pendingReport

  if (report === null) {
    return (
      <section className="phase-shell">
        <div className="panel">
          <p className="muted">Day playback data is missing.</p>
        </div>
      </section>
    )
  }

  const progress = playbackProgress(playbackMs)
  const clock = formatClockTime(progress)
  const customers = report.customerVisits
    .map((visit) => sceneCustomer(visit, progress))
    .filter((visit) => visit.visible)
  const resolvedVisits = visitsResolvedByProgress(report.customerVisits, progress)
  const purchases = resolvedVisits.filter((visit) => visit.outcome === 'buy').length
  const passed = resolvedVisits.filter((visit) => visit.outcome === 'skip').length
  const soldOut = resolvedVisits.filter((visit) => visit.outcome === 'soldOut').length

  return (
    <section className="phase-shell">
      <div className="panel phase-header">
        <div>
          <p className="eyebrow">Day simulation</p>
          <h2>Day Rush</h2>
          <p className="muted">
            {defaultBalanceConfig.weatherProfiles[report.weather].label} traffic is rolling by. Watch the crowd react before the books close.
          </p>
        </div>
        <div className="summary-chip-row">
          <span className="summary-chip">Time {clock}</span>
          <span className="summary-chip">Foot traffic {report.potentialCustomers}</span>
        </div>
      </div>

      <section className="panel day-scene-panel">
        <div className="scene-skyline" aria-hidden="true">
          <div className="scene-building scene-building-teal" />
          <div className="scene-building scene-building-gold" />
          <div className="scene-tree" />
        </div>

        <div className="day-clock-row">
          <div>
            <p className="eyebrow">Business clock</p>
            <strong aria-label="Business clock" className="day-clock-value">
              {clock}
            </strong>
          </div>
          <div className="summary-chip-row">
            <span className="summary-chip">Sold {purchases}</span>
            <span className="summary-chip">Passed {passed + soldOut}</span>
          </div>
        </div>

        <div className={`day-scene weather-${report.weather}`} role="img" aria-label={`Lemonade stand day scene at ${clock}`}>
          <div className="weather-overlay"></div>
          <div className="scene-road" aria-hidden="true" />
          <div className="scene-sidewalk" aria-hidden="true" />
          <div className="stand-cart" aria-hidden="true">
            <img 
              src={
                state.reputation < 40 ? StandTier1Sprite : 
                state.reputation > 75 ? StandTier3Sprite : 
                StandSprite
              } 
              alt="Lemonade Stand" 
              className="stand-sprite" 
            />
          </div>

          <div className="customer-lane">
            {customers.map((visit) => {
              return (
              <div
                className={`customer customer-${visit.outcome}`}
                key={visit.customerIndex}
                style={{
                  left: `${visit.xPercent}%`,
                  bottom: `${1.5 + visit.laneOffsetRem}rem`,
                }}
              >
                {visit.showIndicator ? (
                  <>
                    <span className={`customer-indicator customer-indicator-${visit.indicator}`} aria-label={visit.outcome === 'buy' ? 'Purchase decision yes' : 'Purchase decision no'}>
                      {visit.indicator === 'check' ? '✅' : '❌'}
                    </span>
                    {visit.outcome === 'buy' && (
                       <span className="float-money">+{formatMoney(report.pricePerCup)}</span>
                    )}
                  </>
                ) : null}
                <img 
                  src={visit.customerIndex % 2 === 0 ? Customer1Sprite : Customer2Sprite}
                  alt="Customer"
                  className={`customer-sprite ${visit.isPaused ? 'customer-paused' : ''}`}
                />
              </div>
            )})}
          </div>
        </div>

        <div className="report-grid">
          <MetricCard label="Resolved" value={`${resolvedVisits.length}/${report.potentialCustomers}`} accent />
          <MetricCard label="Purchases" value={`${purchases}`} />
          <MetricCard label="Walked On" value={`${passed}`} />
          <MetricCard label="Sold Out" value={`${soldOut}`} />
        </div>
      </section>
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
              <img 
                src={card.id.includes('timer') || card.id.includes('clock') ? CardClockIcon : CardLemonIcon} 
                alt="" 
                className="draft-card-icon" 
              />
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
  const [dayPlaybackMs, setDayPlaybackMs] = useState(0)
  const [simulationSpeed, setSimulationSpeed] = useState(DEFAULT_SIMULATION_SPEED)
  const inventoryOnHand = displayInventory(state, dayPlaybackMs)

  useEffect(() => {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(saveGame(state)))
  }, [state])

  useEffect(() => {
    if (state.phase !== 'day') {
      return
    }

    const intervalId = window.setInterval(() => {
      setDayPlaybackMs((current) =>
        Math.min(current + DAY_TICK_MS * simulationSpeed, DAY_PLAYBACK_MS + DAY_TRANSITION_DELAY_MS),
      )
    }, DAY_TICK_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [simulationSpeed, state.phase, state.day])

  useEffect(() => {
    if (state.phase !== 'day' || dayPlaybackMs < DAY_PLAYBACK_MS + DAY_TRANSITION_DELAY_MS) {
      return
    }

    startTransition(() => {
      setState((current) => (current.phase === 'day' ? applyEvening(current) : current))
    })
  }, [dayPlaybackMs, state.phase])

  useEffect(() => {
    const appWindow = window as Window & {
      advanceTime?: (ms: number) => void
      render_game_to_text?: () => string
    }

    appWindow.advanceTime = (ms: number) => {
      if (state.phase !== 'day') {
        return
      }

      setDayPlaybackMs((current) =>
        Math.min(
          current + Math.max(0, Math.round(ms * simulationSpeed)),
          DAY_PLAYBACK_MS + DAY_TRANSITION_DELAY_MS,
        ),
      )
    }

    appWindow.render_game_to_text = () =>
      JSON.stringify({
        phase: state.phase,
        day: state.day,
        clock: state.phase === 'day' ? formatClockTime(playbackProgress(dayPlaybackMs)) : null,
        potentialCustomers: state.pendingReport?.potentialCustomers ?? null,
        visibleCustomers:
          state.phase === 'day' && state.pendingReport !== null
            ? state.pendingReport.customerVisits
                .map((visit) => sceneCustomer(visit, playbackProgress(dayPlaybackMs)))
                .filter((visit) => visit.visible)
                .map((visit) => ({
                  customerIndex: visit.customerIndex,
                  outcome: visit.outcome,
                  showIndicator: visit.showIndicator,
                }))
            : [],
        money: state.money,
        reputation: state.reputation,
        inventory: inventoryOnHand,
        simulationSpeed,
      })

    return () => {
      delete appWindow.advanceTime
      delete appWindow.render_game_to_text
    }
  }, [dayPlaybackMs, inventoryOnHand, simulationSpeed, state])

  const resetRun = (): void => {
    window.localStorage.removeItem(SAVE_KEY)
    setError(null)
    setDayPlaybackMs(0)
    startTransition(() => {
      setState(createNewGame())
    })
  }

  const updateSimulationSpeed = (nextValue: number): void => {
    setSimulationSpeed(nextValue)
  }

  const runDay = (form: MorningForm): void => {
    try {
      setError(null)
      setDayPlaybackMs(0)
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

          return resolveDay(prepared)
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
          <p className="eyebrow">Lemonade Stand</p>
          <h1>Grow your citrus empire.</h1>
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
          {state.phase === 'day' ? <DayScreen state={state} playbackMs={dayPlaybackMs} /> : null}
          {state.phase === 'evening' && lastReport !== null ? (
            <EveningScreen report={lastReport} history={state.history} onOpenShop={openShop} />
          ) : null}
          {state.phase === 'night' ? (
            <NightScreen state={state} onPick={chooseCard} onSkip={passTonight} />
          ) : null}
          {state.phase === 'gameOver' ? <GameOverScreen state={state} onRestart={restart} /> : null}
        </div>

        <aside className="side-column">
          {IS_DEV ? (
            <DevToolsPanel
              simulationSpeed={simulationSpeed}
              onSimulationSpeedChange={updateSimulationSpeed}
              onResetRun={resetRun}
            />
          ) : null}
          <section className="panel">
            <p className="eyebrow">Inventory</p>
            <h3>What&apos;s on hand</h3>
            <div className="market-grid">
              <MetricCard label="Lemons" value={`${inventoryOnHand.lemons}`} />
              <MetricCard label="Sugar" value={`${inventoryOnHand.sugar}`} />
              <MetricCard label="Ice" value={`${inventoryOnHand.ice}`} />
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

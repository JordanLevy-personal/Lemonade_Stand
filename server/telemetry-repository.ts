import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import type {
  CustomerOutcome,
  CustomerOutcomeReason,
  CustomerOfferResult,
  CustomerTasteOffsets,
  Inventory,
  Recipe,
} from '../src/game/types'
import type { GameMode, RunLengthDays, Weather } from './contracts'

interface SqliteTelemetryRepositoryOptions {
  databasePath: string
  now?: () => string
}

export interface GameTelemetryRecord {
  gameId: string
  roomId: string
  rngSeed: number
  gameMode: GameMode
  playerCount: number
  runLengthDays: RunLengthDays
}

export interface PlayerDayPlanTelemetryRecord {
  gameId: string
  dayNumber: number
  playerId: string
  analyticsPlayerId: string
  gameMode: GameMode
  playerCount: number
  factionId: string
  weather: Weather
  marketBasePrices: Inventory
  moneyBeforePlanning: number
  reputationBeforePlanning: number
  inventoryBeforePlanning: Inventory
  purchases: Inventory
  recipe: Recipe
  price: number
  submittedAt: string
}

export interface PlayerDayOutcomeTelemetryRecord {
  gameId: string
  dayNumber: number
  playerId: string
  moneyAfterResults: number
  reputationAfterResults: number
  inventoryAfterResults: Inventory
  cupsSold: number
  revenue: number
  satisfaction: number
  reputationDelta: number
  customersWon: number
  customersSkipped: number
  customersSoldOut: number
  resolvedAt: string
}

export interface CustomerProfileTelemetryRecord {
  customerId: string
  tasteOffsets: CustomerTasteOffsets
}

export interface CustomerEventTelemetryRecord {
  customerEventId: string
  customerId: string
  willingnessToPay: number
  preferredRecipe: Recipe
  chosenPlayerId: string | null
  outcome: CustomerOutcome
  salePrice: number
  satisfaction: number
  outcomeReason: CustomerOutcomeReason
}

export interface CustomerOfferScoreTelemetryRecord {
  customerEventId: string
  customerId: string
  playerId: string
  offeredPrice: number
  reputation: number
  preferredRecipeFit: number
  priceScore: number
  historyBonus: number
  totalScore: number
  canFulfill: boolean
  offerResult: CustomerOfferResult
}

export interface TelemetryRepository {
  initialize: () => void
  close: () => void
  upsertGame: (record: GameTelemetryRecord) => void
  touchGameActivity: (gameId: string) => void
  upsertPlayerDayPlan: (record: PlayerDayPlanTelemetryRecord) => void
  upsertPlayerDayOutcome: (record: PlayerDayOutcomeTelemetryRecord) => void
  insertCustomerProfiles: (input: { gameId: string; profiles: CustomerProfileTelemetryRecord[] }) => void
  insertCustomerEvents: (input: { gameId: string; dayNumber: number; events: CustomerEventTelemetryRecord[] }) => void
  insertCustomerOfferScores: (input: { gameId: string; dayNumber: number; scores: CustomerOfferScoreTelemetryRecord[] }) => void
}

export class SqliteTelemetryRepository implements TelemetryRepository {
  private readonly databasePath: string
  private readonly now: () => string
  private database: DatabaseSync | null = null

  constructor(options: SqliteTelemetryRepositoryOptions) {
    this.databasePath = options.databasePath
    this.now = options.now ?? (() => new Date().toISOString())
  }

  initialize(): void {
    mkdirSync(dirname(this.databasePath), { recursive: true })
    this.database = new DatabaseSync(this.databasePath)
    this.database.exec(`
      pragma journal_mode = wal;

      create table if not exists games (
        game_id text primary key,
        room_id text not null,
        rng_seed integer not null,
        game_mode text not null,
        player_count integer not null,
        run_length_days integer not null,
        created_at text not null,
        last_activity_at text not null
      );

      create table if not exists player_day_records (
        game_id text not null,
        day_number integer not null,
        player_id text not null,
        analytics_player_id text not null,
        game_mode text not null,
        player_count integer not null,
        faction_id text not null,
        weather text not null,
        market_base_price_lemons real not null,
        market_base_price_sugar real not null,
        market_base_price_ice real not null,
        money_before_planning real not null,
        reputation_before_planning integer not null,
        inventory_before_planning_lemons real not null,
        inventory_before_planning_sugar real not null,
        inventory_before_planning_ice real not null,
        purchases_lemons real not null,
        purchases_sugar real not null,
        purchases_ice real not null,
        recipe_lemons real not null,
        recipe_sugar real not null,
        recipe_ice real not null,
        price real not null,
        submitted_at text not null,
        money_after_results real,
        reputation_after_results integer,
        inventory_after_results_lemons real,
        inventory_after_results_sugar real,
        inventory_after_results_ice real,
        cups_sold integer,
        revenue real,
        satisfaction real,
        reputation_delta integer,
        customers_won integer,
        customers_skipped integer,
        customers_sold_out integer,
        resolved_at text,
        primary key (game_id, day_number, player_id)
      );

      create table if not exists customer_profiles (
        game_id text not null,
        customer_id text not null,
        taste_lemons integer not null,
        taste_sugar integer not null,
        taste_ice integer not null,
        created_at text not null,
        primary key (game_id, customer_id)
      );

      create table if not exists customer_events (
        game_id text not null,
        day_number integer not null,
        customer_event_id text not null,
        customer_id text not null,
        willingness_to_pay real not null,
        preferred_recipe_lemons real not null,
        preferred_recipe_sugar real not null,
        preferred_recipe_ice real not null,
        chosen_player_id text,
        outcome text not null,
        sale_price real not null,
        satisfaction real not null,
        outcome_reason text not null,
        created_at text not null,
        primary key (game_id, day_number, customer_event_id)
      );

      create table if not exists customer_offer_scores (
        game_id text not null,
        day_number integer not null,
        customer_event_id text not null,
        customer_id text not null,
        player_id text not null,
        offered_price real not null,
        reputation integer not null,
        preferred_recipe_fit real not null,
        price_score real not null,
        history_bonus real not null,
        total_score real not null,
        can_fulfill integer not null,
        offer_result text not null,
        created_at text not null,
        primary key (game_id, day_number, customer_event_id, player_id)
      );
    `)
    this.ensureColumn('games', 'game_mode', "text not null default 'multiplayer'")
    this.ensureColumn('games', 'player_count', 'integer not null default 2')
    this.ensureColumn('games', 'run_length_days', 'integer not null default 14')
    this.ensureColumn('player_day_records', 'game_mode', "text not null default 'multiplayer'")
    this.ensureColumn('player_day_records', 'player_count', 'integer not null default 2')
  }

  close(): void {
    this.database?.close()
    this.database = null
  }

  upsertGame(record: GameTelemetryRecord): void {
    const timestamp = this.now()

    this.requireDatabase().prepare(`
      insert into games (
        game_id,
        room_id,
        rng_seed,
        game_mode,
        player_count,
        run_length_days,
        created_at,
        last_activity_at
      ) values (
        :gameId,
        :roomId,
        :rngSeed,
        :gameMode,
        :playerCount,
        :runLengthDays,
        :createdAt,
        :lastActivityAt
      )
      on conflict(game_id) do update set
        room_id = excluded.room_id,
        rng_seed = excluded.rng_seed,
        game_mode = excluded.game_mode,
        player_count = excluded.player_count,
        run_length_days = excluded.run_length_days,
        last_activity_at = excluded.last_activity_at
    `).run({
      gameId: record.gameId,
      roomId: record.roomId,
      rngSeed: record.rngSeed,
      gameMode: record.gameMode,
      playerCount: record.playerCount,
      runLengthDays: record.runLengthDays,
      createdAt: timestamp,
      lastActivityAt: timestamp,
    })
  }

  touchGameActivity(gameId: string): void {
    this.requireDatabase().prepare(`
      update games
      set last_activity_at = :lastActivityAt
      where game_id = :gameId
    `).run({
      gameId,
      lastActivityAt: this.now(),
    })
  }

  upsertPlayerDayPlan(record: PlayerDayPlanTelemetryRecord): void {
    this.requireDatabase().prepare(`
      insert into player_day_records (
        game_id,
        day_number,
        player_id,
        analytics_player_id,
        game_mode,
        player_count,
        faction_id,
        weather,
        market_base_price_lemons,
        market_base_price_sugar,
        market_base_price_ice,
        money_before_planning,
        reputation_before_planning,
        inventory_before_planning_lemons,
        inventory_before_planning_sugar,
        inventory_before_planning_ice,
        purchases_lemons,
        purchases_sugar,
        purchases_ice,
        recipe_lemons,
        recipe_sugar,
        recipe_ice,
        price,
        submitted_at
      ) values (
        :gameId,
        :dayNumber,
        :playerId,
        :analyticsPlayerId,
        :gameMode,
        :playerCount,
        :factionId,
        :weather,
        :marketBasePriceLemons,
        :marketBasePriceSugar,
        :marketBasePriceIce,
        :moneyBeforePlanning,
        :reputationBeforePlanning,
        :inventoryBeforePlanningLemons,
        :inventoryBeforePlanningSugar,
        :inventoryBeforePlanningIce,
        :purchasesLemons,
        :purchasesSugar,
        :purchasesIce,
        :recipeLemons,
        :recipeSugar,
        :recipeIce,
        :price,
        :submittedAt
      )
      on conflict(game_id, day_number, player_id) do update set
        analytics_player_id = excluded.analytics_player_id,
        game_mode = excluded.game_mode,
        player_count = excluded.player_count,
        faction_id = excluded.faction_id,
        weather = excluded.weather,
        market_base_price_lemons = excluded.market_base_price_lemons,
        market_base_price_sugar = excluded.market_base_price_sugar,
        market_base_price_ice = excluded.market_base_price_ice,
        money_before_planning = excluded.money_before_planning,
        reputation_before_planning = excluded.reputation_before_planning,
        inventory_before_planning_lemons = excluded.inventory_before_planning_lemons,
        inventory_before_planning_sugar = excluded.inventory_before_planning_sugar,
        inventory_before_planning_ice = excluded.inventory_before_planning_ice,
        purchases_lemons = excluded.purchases_lemons,
        purchases_sugar = excluded.purchases_sugar,
        purchases_ice = excluded.purchases_ice,
        recipe_lemons = excluded.recipe_lemons,
        recipe_sugar = excluded.recipe_sugar,
        recipe_ice = excluded.recipe_ice,
        price = excluded.price,
        submitted_at = excluded.submitted_at
    `).run({
      gameId: record.gameId,
      dayNumber: record.dayNumber,
      playerId: record.playerId,
      analyticsPlayerId: record.analyticsPlayerId,
      gameMode: record.gameMode,
      playerCount: record.playerCount,
      factionId: record.factionId,
      weather: record.weather,
      marketBasePriceLemons: record.marketBasePrices.lemons,
      marketBasePriceSugar: record.marketBasePrices.sugar,
      marketBasePriceIce: record.marketBasePrices.ice,
      moneyBeforePlanning: record.moneyBeforePlanning,
      reputationBeforePlanning: record.reputationBeforePlanning,
      inventoryBeforePlanningLemons: record.inventoryBeforePlanning.lemons,
      inventoryBeforePlanningSugar: record.inventoryBeforePlanning.sugar,
      inventoryBeforePlanningIce: record.inventoryBeforePlanning.ice,
      purchasesLemons: record.purchases.lemons,
      purchasesSugar: record.purchases.sugar,
      purchasesIce: record.purchases.ice,
      recipeLemons: record.recipe.lemons,
      recipeSugar: record.recipe.sugar,
      recipeIce: record.recipe.ice,
      price: record.price,
      submittedAt: record.submittedAt,
    })
  }

  upsertPlayerDayOutcome(record: PlayerDayOutcomeTelemetryRecord): void {
    this.requireDatabase().prepare(`
      update player_day_records
      set
        money_after_results = :moneyAfterResults,
        reputation_after_results = :reputationAfterResults,
        inventory_after_results_lemons = :inventoryAfterResultsLemons,
        inventory_after_results_sugar = :inventoryAfterResultsSugar,
        inventory_after_results_ice = :inventoryAfterResultsIce,
        cups_sold = :cupsSold,
        revenue = :revenue,
        satisfaction = :satisfaction,
        reputation_delta = :reputationDelta,
        customers_won = :customersWon,
        customers_skipped = :customersSkipped,
        customers_sold_out = :customersSoldOut,
        resolved_at = :resolvedAt
      where game_id = :gameId and day_number = :dayNumber and player_id = :playerId
    `).run({
      gameId: record.gameId,
      dayNumber: record.dayNumber,
      playerId: record.playerId,
      moneyAfterResults: record.moneyAfterResults,
      reputationAfterResults: record.reputationAfterResults,
      inventoryAfterResultsLemons: record.inventoryAfterResults.lemons,
      inventoryAfterResultsSugar: record.inventoryAfterResults.sugar,
      inventoryAfterResultsIce: record.inventoryAfterResults.ice,
      cupsSold: record.cupsSold,
      revenue: record.revenue,
      satisfaction: record.satisfaction,
      reputationDelta: record.reputationDelta,
      customersWon: record.customersWon,
      customersSkipped: record.customersSkipped,
      customersSoldOut: record.customersSoldOut,
      resolvedAt: record.resolvedAt,
    })
  }

  insertCustomerProfiles(input: { gameId: string; profiles: CustomerProfileTelemetryRecord[] }): void {
    const statement = this.requireDatabase().prepare(`
      insert or ignore into customer_profiles (
        game_id,
        customer_id,
        taste_lemons,
        taste_sugar,
        taste_ice,
        created_at
      ) values (
        :gameId,
        :customerId,
        :tasteLemons,
        :tasteSugar,
        :tasteIce,
        :createdAt
      )
    `)

    for (const profile of input.profiles) {
      statement.run({
        gameId: input.gameId,
        customerId: profile.customerId,
        tasteLemons: profile.tasteOffsets.lemons,
        tasteSugar: profile.tasteOffsets.sugar,
        tasteIce: profile.tasteOffsets.ice,
        createdAt: this.now(),
      })
    }
  }

  insertCustomerEvents(input: { gameId: string; dayNumber: number; events: CustomerEventTelemetryRecord[] }): void {
    const statement = this.requireDatabase().prepare(`
      insert or replace into customer_events (
        game_id,
        day_number,
        customer_event_id,
        customer_id,
        willingness_to_pay,
        preferred_recipe_lemons,
        preferred_recipe_sugar,
        preferred_recipe_ice,
        chosen_player_id,
        outcome,
        sale_price,
        satisfaction,
        outcome_reason,
        created_at
      ) values (
        :gameId,
        :dayNumber,
        :customerEventId,
        :customerId,
        :willingnessToPay,
        :preferredRecipeLemons,
        :preferredRecipeSugar,
        :preferredRecipeIce,
        :chosenPlayerId,
        :outcome,
        :salePrice,
        :satisfaction,
        :outcomeReason,
        :createdAt
      )
    `)

    for (const event of input.events) {
      statement.run({
        gameId: input.gameId,
        dayNumber: input.dayNumber,
        customerEventId: event.customerEventId,
        customerId: event.customerId,
        willingnessToPay: event.willingnessToPay,
        preferredRecipeLemons: event.preferredRecipe.lemons,
        preferredRecipeSugar: event.preferredRecipe.sugar,
        preferredRecipeIce: event.preferredRecipe.ice,
        chosenPlayerId: event.chosenPlayerId,
        outcome: event.outcome,
        salePrice: event.salePrice,
        satisfaction: event.satisfaction,
        outcomeReason: event.outcomeReason,
        createdAt: this.now(),
      })
    }
  }

  insertCustomerOfferScores(input: { gameId: string; dayNumber: number; scores: CustomerOfferScoreTelemetryRecord[] }): void {
    const statement = this.requireDatabase().prepare(`
      insert or replace into customer_offer_scores (
        game_id,
        day_number,
        customer_event_id,
        customer_id,
        player_id,
        offered_price,
        reputation,
        preferred_recipe_fit,
        price_score,
        history_bonus,
        total_score,
        can_fulfill,
        offer_result,
        created_at
      ) values (
        :gameId,
        :dayNumber,
        :customerEventId,
        :customerId,
        :playerId,
        :offeredPrice,
        :reputation,
        :preferredRecipeFit,
        :priceScore,
        :historyBonus,
        :totalScore,
        :canFulfill,
        :offerResult,
        :createdAt
      )
    `)

    for (const score of input.scores) {
      statement.run({
        gameId: input.gameId,
        dayNumber: input.dayNumber,
        customerEventId: score.customerEventId,
        customerId: score.customerId,
        playerId: score.playerId,
        offeredPrice: score.offeredPrice,
        reputation: score.reputation,
        preferredRecipeFit: score.preferredRecipeFit,
        priceScore: score.priceScore,
        historyBonus: score.historyBonus,
        totalScore: score.totalScore,
        canFulfill: score.canFulfill ? 1 : 0,
        offerResult: score.offerResult,
        createdAt: this.now(),
      })
    }
  }

  private requireDatabase(): DatabaseSync {
    if (this.database === null) {
      throw new Error('Telemetry repository has not been initialized.')
    }

    return this.database
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const existingColumns = this.requireDatabase()
      .prepare(`pragma table_info(${tableName})`)
      .all() as Array<{ name: string }>

    if (existingColumns.some((column) => column.name === columnName)) {
      return
    }

    this.requireDatabase().exec(`
      alter table ${tableName}
      add column ${columnName} ${definition}
    `)
  }
}

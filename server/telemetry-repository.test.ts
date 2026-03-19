// @vitest-environment node

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import { SqliteTelemetryRepository } from './telemetry-repository'

function readTable(databasePath: string, query: string): Record<string, unknown>[] {
  const database = new DatabaseSync(databasePath)

  try {
    return database.prepare(query).all() as Record<string, unknown>[]
  } finally {
    database.close()
  }
}

describe('SqliteTelemetryRepository', () => {
  const tempDirectories: string[] = []

  afterEach(() => {
    while (tempDirectories.length > 0) {
      const directory = tempDirectories.pop()

      if (directory !== undefined) {
        rmSync(directory, { recursive: true, force: true })
      }
    }
  })

  function createRepository() {
    const directory = mkdtempSync(join(tmpdir(), 'telemetry-repository-'))
    const databasePath = join(directory, 'playtest.sqlite')
    tempDirectories.push(directory)

    const repository = new SqliteTelemetryRepository({
      databasePath,
      now: () => '2026-03-18T12:30:00.000Z',
    })

    repository.initialize()

    return {
      repository,
      databasePath,
    }
  }

  it('creates the telemetry schema and upserts player-day plans and outcomes', () => {
    const { repository, databasePath } = createRepository()

    repository.upsertGame({
      gameId: 'ROOM01',
      roomId: 'ROOM01',
      rngSeed: 1234,
      gameMode: 'singleplayer',
      playerCount: 1,
      runLengthDays: 14,
      customerTastePreferenceWeight: 0.2,
    })
    repository.upsertPlayerDayPlan({
      gameId: 'ROOM01',
      dayNumber: 1,
      playerId: 'host-1',
      analyticsPlayerId: 'analytics-host',
      gameMode: 'singleplayer',
      playerCount: 1,
      factionId: 'sun-guild',
      weather: 'sunny',
      marketBasePrices: {
        lemons: 0.4,
        sugar: 0.2,
        ice: 0.1,
      },
      moneyBeforePlanning: 20,
      reputationBeforePlanning: 50,
      inventoryBeforePlanning: {
        lemons: 0,
        sugar: 0,
        ice: 0,
      },
      recipeFeedbackHintsOwnedBeforePlanning: false,
      purchases: {
        lemons: 3,
        sugar: 2,
        ice: 1,
      },
      recipe: {
        lemons: 2,
        sugar: 2,
        ice: 1,
      },
      price: 1.35,
      submittedAt: '2026-03-18T12:31:00.000Z',
    })
    repository.upsertPlayerDayPlan({
      gameId: 'ROOM01',
      dayNumber: 1,
      playerId: 'host-1',
      analyticsPlayerId: 'analytics-host',
      gameMode: 'singleplayer',
      playerCount: 1,
      factionId: 'sun-guild',
      weather: 'sunny',
      marketBasePrices: {
        lemons: 0.4,
        sugar: 0.2,
        ice: 0.1,
      },
      moneyBeforePlanning: 20,
      reputationBeforePlanning: 50,
      inventoryBeforePlanning: {
        lemons: 0,
        sugar: 0,
        ice: 0,
      },
      recipeFeedbackHintsOwnedBeforePlanning: true,
      purchases: {
        lemons: 4,
        sugar: 3,
        ice: 2,
      },
      recipe: {
        lemons: 2,
        sugar: 2,
        ice: 2,
      },
      price: 1.45,
      submittedAt: '2026-03-18T12:32:00.000Z',
    })
    repository.upsertPlayerDayOutcome({
      gameId: 'ROOM01',
      dayNumber: 1,
      playerId: 'host-1',
      moneyAfterResults: 22.9,
      reputationAfterResults: 52,
      inventoryAfterResults: {
        lemons: 2,
        sugar: 1,
        ice: 0,
      },
      recipeFeedbackHintsOwnedAfterResults: true,
      cupsSold: 2,
      revenue: 2.9,
      satisfaction: 0.82,
      reputationDelta: 2,
      customersWon: 3,
      customersSkipped: 5,
      customersSoldOut: 1,
      resolvedAt: '2026-03-18T12:33:00.000Z',
    })

    const playerDayRows = readTable(
      databasePath,
      'select analytics_player_id, game_mode, player_count, recipe_feedback_hints_owned_before_planning, purchases_lemons, purchases_sugar, purchases_ice, price, recipe_feedback_hints_owned_after_results, cups_sold, revenue, customers_sold_out from player_day_records',
    )
    const gameRows = readTable(
      databasePath,
      'select game_id, room_id, rng_seed, game_mode, player_count, run_length_days, customer_taste_preference_weight from games',
    )

    expect(gameRows).toEqual([
      {
        game_id: 'ROOM01',
        room_id: 'ROOM01',
        rng_seed: 1234,
        game_mode: 'singleplayer',
        player_count: 1,
        run_length_days: 14,
        customer_taste_preference_weight: 0.2,
      },
    ])
    expect(playerDayRows).toEqual([
      {
        analytics_player_id: 'analytics-host',
        game_mode: 'singleplayer',
        player_count: 1,
        recipe_feedback_hints_owned_before_planning: 1,
        purchases_lemons: 4,
        purchases_sugar: 3,
        purchases_ice: 2,
        price: 1.45,
        recipe_feedback_hints_owned_after_results: 1,
        cups_sold: 2,
        revenue: 2.9,
        customers_sold_out: 1,
      },
    ])
  })

  it('stores customer profiles, customer events, and player offer scores', () => {
    const { repository, databasePath } = createRepository()

    repository.upsertGame({
      gameId: 'ROOM02',
      roomId: 'ROOM02',
      rngSeed: 999,
      gameMode: 'multiplayer',
      playerCount: 2,
      runLengthDays: 30,
      customerTastePreferenceWeight: 0.2,
    })
    repository.insertCustomerProfiles({
      gameId: 'ROOM02',
      profiles: [
        {
          customerId: 'customer-1',
          tasteOffsets: {
            lemons: 1,
            sugar: 0,
            ice: -1,
          },
        },
      ],
    })
    repository.insertCustomerProfiles({
      gameId: 'ROOM02',
      profiles: [
        {
          customerId: 'customer-1',
          tasteOffsets: {
            lemons: 5,
            sugar: 5,
            ice: 5,
          },
        },
      ],
    })
    repository.insertCustomerEvents({
      gameId: 'ROOM02',
      dayNumber: 1,
      events: [
        {
          customerEventId: 'event-1',
          customerId: 'customer-1',
          willingnessToPay: 1.9,
          preferredRecipe: {
            lemons: 3,
            sugar: 2,
            ice: 1,
          },
          chosenPlayerId: 'host-1',
          outcome: 'buy',
          salePrice: 1.4,
          satisfaction: 0.81,
          outcomeReason: 'purchased_after_sold_out_reroute',
          rerouteCount: 1,
        },
      ],
    })
    repository.insertCustomerOfferScores({
      gameId: 'ROOM02',
      dayNumber: 1,
      scores: [
        {
          customerEventId: 'event-1',
          customerId: 'customer-1',
          playerId: 'guest-1',
          offeredPrice: 1.95,
          reputation: 50,
          preferredRecipeFit: 0.9,
          priceScore: 0.26,
          historyBonus: 0,
          totalScore: 0.531,
          canFulfill: false,
          selectionRound: 1,
          offerResult: 'selected_but_sold_out',
        },
        {
          customerEventId: 'event-1',
          customerId: 'customer-1',
          playerId: 'host-1',
          offeredPrice: 1.4,
          reputation: 50,
          preferredRecipeFit: 0.92,
          priceScore: 0.26,
          historyBonus: 0,
          totalScore: 0.531,
          canFulfill: true,
          selectionRound: 2,
          offerResult: 'selected',
        },
      ],
    })

    const profileRows = readTable(
      databasePath,
      'select customer_id, taste_lemons, taste_sugar, taste_ice from customer_profiles',
    )
    const eventRows = readTable(
      databasePath,
      'select customer_event_id, outcome, outcome_reason, reroute_count, preferred_recipe_lemons from customer_events',
    )
    const scoreRows = readTable(
      databasePath,
      'select player_id, selection_round, offer_result, total_score from customer_offer_scores order by selection_round, player_id',
    )

    expect(profileRows).toEqual([
      {
        customer_id: 'customer-1',
        taste_lemons: 1,
        taste_sugar: 0,
        taste_ice: -1,
      },
    ])
    expect(eventRows).toEqual([
      {
        customer_event_id: 'event-1',
        outcome: 'buy',
        outcome_reason: 'purchased_after_sold_out_reroute',
        reroute_count: 1,
        preferred_recipe_lemons: 3,
      },
    ])
    expect(scoreRows).toEqual([
      {
        player_id: 'guest-1',
        selection_round: 1,
        offer_result: 'selected_but_sold_out',
        total_score: 0.531,
      },
      {
        player_id: 'host-1',
        selection_round: 2,
        offer_result: 'selected',
        total_score: 0.531,
      },
    ])
  })
})

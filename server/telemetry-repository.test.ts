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
    })
    repository.upsertPlayerDayPlan({
      gameId: 'ROOM01',
      dayNumber: 1,
      playerId: 'host-1',
      analyticsPlayerId: 'analytics-host',
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
      'select analytics_player_id, purchases_lemons, purchases_sugar, purchases_ice, price, cups_sold, revenue, customers_sold_out from player_day_records',
    )
    const gameRows = readTable(
      databasePath,
      'select game_id, room_id, rng_seed from games',
    )

    expect(gameRows).toEqual([
      {
        game_id: 'ROOM01',
        room_id: 'ROOM01',
        rng_seed: 1234,
      },
    ])
    expect(playerDayRows).toEqual([
      {
        analytics_player_id: 'analytics-host',
        purchases_lemons: 4,
        purchases_sugar: 3,
        purchases_ice: 2,
        price: 1.45,
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
          outcomeReason: 'purchased',
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
          playerId: 'host-1',
          offeredPrice: 1.4,
          reputation: 50,
          preferredRecipeFit: 0.92,
          priceScore: 0.26,
          historyBonus: 0,
          totalScore: 0.531,
          canFulfill: true,
          offerResult: 'selected',
        },
        {
          customerEventId: 'event-1',
          customerId: 'customer-1',
          playerId: 'guest-1',
          offeredPrice: 1.95,
          reputation: 50,
          preferredRecipeFit: 0.9,
          priceScore: 0,
          historyBonus: 0,
          totalScore: 0,
          canFulfill: true,
          offerResult: 'price_rejected',
        },
      ],
    })

    const profileRows = readTable(
      databasePath,
      'select customer_id, taste_lemons, taste_sugar, taste_ice from customer_profiles',
    )
    const eventRows = readTable(
      databasePath,
      'select customer_event_id, outcome, outcome_reason, preferred_recipe_lemons from customer_events',
    )
    const scoreRows = readTable(
      databasePath,
      'select player_id, offer_result, total_score from customer_offer_scores order by player_id',
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
        outcome_reason: 'purchased',
        preferred_recipe_lemons: 3,
      },
    ])
    expect(scoreRows).toEqual([
      {
        player_id: 'guest-1',
        offer_result: 'price_rejected',
        total_score: 0,
      },
      {
        player_id: 'host-1',
        offer_result: 'selected',
        total_score: 0.531,
      },
    ])
  })
})

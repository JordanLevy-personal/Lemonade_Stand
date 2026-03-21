#!/usr/bin/env bash

# Migration script: Add telemetry versioning
# - Adds telemetry_version column to games table
# - Tags all existing games as v0.1 (pre-balance-tuning)
# - New games created after this migration will be v0.2
#
# Usage:
#   ./scripts/migrate-telemetry-v0.2.sh [path-to-database]
#
# Default database path: ./data/playtest-telemetry.sqlite

set -euo pipefail

DB_PATH="${1:-./data/playtest-telemetry.sqlite}"

if [ ! -f "$DB_PATH" ]; then
  echo "Error: Database not found at $DB_PATH"
  echo "Usage: $0 [path-to-database]"
  exit 1
fi

echo "Migrating database: $DB_PATH"
echo ""

# Check if column already exists
HAS_COLUMN=$(sqlite3 "$DB_PATH" "pragma table_info(games);" | grep -c "telemetry_version" || true)

if [ "$HAS_COLUMN" -gt 0 ]; then
  echo "Column 'telemetry_version' already exists. Checking current state..."
  sqlite3 "$DB_PATH" "
    SELECT telemetry_version, COUNT(*) as game_count
    FROM games
    GROUP BY telemetry_version
    ORDER BY telemetry_version;
  "
  echo ""
  echo "No migration needed."
  exit 0
fi

echo "Adding telemetry_version column..."
sqlite3 "$DB_PATH" "
  ALTER TABLE games ADD COLUMN telemetry_version text NOT NULL DEFAULT '0.1';
"

GAME_COUNT=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM games;")
echo "Tagged $GAME_COUNT existing games as v0.1"

echo ""
echo "Migration complete. Summary:"
sqlite3 "$DB_PATH" "
  SELECT telemetry_version, COUNT(*) as game_count
  FROM games
  GROUP BY telemetry_version
  ORDER BY telemetry_version;
"

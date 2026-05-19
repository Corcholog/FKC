-- Migration to support cached analytics for the dashboard
-- Instead of calculating hundreds of match scores on the fly, 
-- we store the pre-calculated roster stats as a JSON payload per mode.

BEGIN;

CREATE TABLE IF NOT EXISTS roster_stats_cache (
  mode VARCHAR(20) PRIMARY KEY, -- 'team', 'soloq', 'mixed'
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Real-time publication setup for the Tournament Stage
-- We add this here to prepare for Real-Time Standings
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE tournament_matches, tournament_dates, tournament_groups, tournament_group_teams;

COMMIT;

-- Migration to add org_id for multi-team support
-- Defaulting to 'FKC' for all existing records to ensure backward compatibility

BEGIN;

-- Add org_id to core tables
ALTER TABLE players ADD COLUMN IF NOT EXISTS org_id VARCHAR(50) DEFAULT 'FKC';
ALTER TABLE matches ADD COLUMN IF NOT EXISTS org_id VARCHAR(50) DEFAULT 'FKC';
ALTER TABLE tournament_teams ADD COLUMN IF NOT EXISTS org_id VARCHAR(50) DEFAULT 'FKC';

-- Add indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_players_org_id ON players(org_id);
CREATE INDEX IF NOT EXISTS idx_matches_org_id ON matches(org_id);
CREATE INDEX IF NOT EXISTS idx_tournament_teams_org_id ON tournament_teams(org_id);

COMMIT;

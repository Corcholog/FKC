-- Run this in your Supabase SQL Editor to create the tables for the Tournament Scouting feature

-- 1. Create tournament_teams table
CREATE TABLE tournament_teams (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Create tournament_players table
CREATE TABLE tournament_players (
  id SERIAL PRIMARY KEY,
  team_id INTEGER REFERENCES tournament_teams(id) ON DELETE CASCADE,
  ign VARCHAR(255) NOT NULL, -- e.g. "PlayerName#TAG"
  puuid VARCHAR(255),
  soloq_tier VARCHAR(50),
  soloq_rank VARCHAR(50),
  soloq_lp INTEGER,
  flexq_tier VARCHAR(50),
  flexq_rank VARCHAR(50),
  flexq_lp INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

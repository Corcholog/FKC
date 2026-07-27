-- Fake Clan SoloQ Tracker — Supabase schema
-- Run this in the Supabase SQL editor (Project → SQL Editor → New query)
-- See 03_DATABASE_SCHEMA.md for the reasoning behind each table.

create extension if not exists pgcrypto;

-- ============================================================
-- players: the roster, managed via the admin page
-- ============================================================
create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  riot_puuid text unique not null,
  riot_game_name text not null,
  riot_tag_line text not null,
  display_name text not null,
  avatar_url text,
  platform text not null default 'LA2',       -- LA2 = LAS in Riot's platform routing values

  -- cached current-rank snapshot, refreshed every sync
  tier text,                                   -- e.g. 'GOLD'
  division text,                                -- e.g. 'II' (null for Master+/apex tiers)
  league_points integer,
  wins integer default 0,
  losses integer default 0,
  rank_updated_at timestamptz,

  created_at timestamptz not null default now()
);

-- ============================================================
-- matches: one row per unique Riot match, shared across players
-- ============================================================
create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  riot_match_id text unique not null,
  queue_id integer not null,                    -- 420 = ranked solo/duo
  game_creation timestamptz not null,
  game_duration_seconds integer not null,
  game_version text,                             -- patch string, e.g. '26.15.1'
  fetched_at timestamptz not null default now()
);

create index if not exists idx_matches_game_creation on matches (game_creation desc);

-- ============================================================
-- match_participants: 10 rows per match — every ally and enemy
-- ============================================================
create table if not exists match_participants (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  player_id uuid references players(id) on delete set null, -- null if not a tracked friend

  puuid text not null,
  riot_game_name text,
  riot_tag_line text,

  team_id integer not null,                      -- 100 or 200
  champion_id integer not null,
  champion_name text not null,                   -- Riot's championName string
  win boolean not null,

  kills integer not null default 0,
  deaths integer not null default 0,
  assists integer not null default 0,
  damage_dealt_to_champions integer not null default 0,
  gold_earned integer not null default 0,
  total_minions_killed integer not null default 0,
  neutral_minions_killed integer not null default 0,
  total_cs integer generated always as (total_minions_killed + neutral_minions_killed) stored,

  created_at timestamptz not null default now(),
  unique (match_id, puuid)
);

create index if not exists idx_participants_player on match_participants (player_id);
create index if not exists idx_participants_match on match_participants (match_id);

-- ============================================================
-- match_notes: free-text review notes on a specific player's game
-- ============================================================
create table if not exists match_notes (
  id uuid primary key default gen_random_uuid(),
  match_participant_id uuid not null references match_participants(id) on delete cascade,
  note text not null,
  author_name text,                              -- optional, free text (shared login, no real user FK yet)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notes_participant on match_notes (match_participant_id);

-- ============================================================
-- player_ai_summaries: one row per player, latest Gemini summary
-- ============================================================
create table if not exists player_ai_summaries (
  id uuid primary key default gen_random_uuid(),
  player_id uuid unique not null references players(id) on delete cascade,
  summary_text text,
  generated_at timestamptz,
  stale boolean not null default true
);

-- ============================================================
-- sync_state: singleton row tracking sync health / Riot key status
-- ============================================================
create table if not exists sync_state (
  id smallint primary key default 1,
  last_sync_started_at timestamptz,
  last_sync_finished_at timestamptz,
  last_sync_status text,                          -- 'success' | 'error' | 'running'
  riot_key_valid boolean not null default true,
  riot_api_key text,                              -- optional: store the key here instead of a Vercel env var
                                                    -- (see 02_ARCHITECTURE.md §4 for the tradeoff)
  last_error text,
  constraint sync_state_singleton check (id = 1)
);

insert into sync_state (id) values (1) on conflict (id) do nothing;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table players enable row level security;
alter table matches enable row level security;
alter table match_participants enable row level security;
alter table match_notes enable row level security;
alter table player_ai_summaries enable row level security;
alter table sync_state enable row level security;

create policy "authenticated_full_access" on players
  for all using (auth.role() = 'authenticated');

create policy "authenticated_full_access" on matches
  for all using (auth.role() = 'authenticated');

create policy "authenticated_full_access" on match_participants
  for all using (auth.role() = 'authenticated');

create policy "authenticated_full_access" on match_notes
  for all using (auth.role() = 'authenticated');

create policy "authenticated_full_access" on player_ai_summaries
  for all using (auth.role() = 'authenticated');

create policy "authenticated_full_access" on sync_state
  for all using (auth.role() = 'authenticated');

-- Note: the sync job itself (server-side, /api/sync) should use Supabase's
-- service_role key, which bypasses RLS entirely — it needs to write data
-- via a scheduled Vercel Cron call that has no interactive user session.

# Database Schema — Fake Clan SoloQ Tracker

Run `schema.sql` directly in the Supabase SQL editor to create everything below in one shot. This doc explains the *why* behind each table; that file has the actual runnable SQL.

## Tables

### `players`
One row per tracked friend. This is the "roster," managed from the admin page.

Holds both their identity (Riot ID, avatar) and a **cached snapshot of their current rank** (tier/division/LP/wins/losses), refreshed on every sync. The home page reads straight from this table — it never needs to call Riot live, which is the whole point of syncing to a database instead of hitting the API on every page load.

### `matches`
One row per unique Riot match (`riot_match_id` is unique) — **shared across players**, not duplicated per player. If two Fake Clan members are in the same game together, that's still one row here. This is what makes the incremental-sync stop condition work cleanly (check `04_RIOT_API_INTEGRATION.md`): "have we seen this match ID before?" is a single lookup regardless of how many tracked players were in it.

### `match_participants`
One row **per participant per match** — 10 rows per match, always, regardless of how many are Fake Clan members. This is what stores "every champion, allies and enemies" as you specified: kills/deaths/assists, damage to champions, gold, CS (split into minion and neutral/jungle CS, with a generated `total_cs` column so you don't have to remember to add them every time you query).

`player_id` is nullable — it's set for participants who are one of your tracked friends, and left `null` for randoms (both teammates and enemies who aren't in the group). This lets the match-detail page render the full 10-player breakdown while still being able to ask "which of these games were the Fake Clan actually in together."

### `match_notes`
Free-text notes, attached to a specific **`match_participant`** row (i.e., a specific player's specific game) — not to the match as a whole. So a note is always "what this person did in this game," matching your "add what you did wrong as a review" use case. `author_name` is optional free text (not a foreign key to a user account) since the MVP has one shared login — it just lets whoever's typing note who they are, without building real per-user auth.

### `player_ai_summaries`
One row per player, holding the latest Gemini-generated summary text, when it was generated, and a `stale` flag. The sync job and the notes API route both set `stale = true` when they touch a player's data; the summary route clears it after regenerating. See `02_ARCHITECTURE.md` §6 for the generation strategy.

### `sync_state`
A **singleton** row (always `id = 1`, enforced by a check constraint) tracking the health of the last sync: when it last ran, whether it succeeded, and whether the Riot API key is currently valid. This is what powers the navbar's expired-key popup. If you go with the "store the Riot key in the database" approach from `02_ARCHITECTURE.md` §4, that key lives on this same row.

## Row Level Security

All tables have RLS enabled. For the MVP (single shared login), every table gets the same simple policy: allow all operations for any authenticated session. There's genuinely no finer-grained access to model yet — everyone with the login is equally "in the group."

```sql
create policy "authenticated_full_access" on players
  for all using (auth.role() = 'authenticated');
-- repeat per table, or write a small helper/loop in the SQL editor
```

The one exception: the sync job itself runs with the **service role key** (server-side only, in `/api/sync`), which bypasses RLS entirely — it needs to write data before there's necessarily an interactive user session involved (e.g., when Vercel Cron triggers it).

When you build the future per-player chat feature, only the new chat table(s) need a tighter, per-user policy — see `02_ARCHITECTURE.md` §5.

# Riot API Integration — Fake Clan SoloQ Tracker

This is the part of the project worth reading slowly — getting the routing and the remake/early-surrender filtering right up front saves you from a confusing rewrite later.

## 1. Routing

Riot's API splits endpoints across two different kinds of routing values. Mixing them up is the single most common mistake when building against this API.

| Purpose | Routing type | Value for LAS | Base URL |
|---|---|---|---|
| Rank/league data (League-V4), summoner data (Summoner-V4) | **Platform** routing | `LA2` | `https://la2.api.riotgames.com` |
| Match data (Match-V5), Riot ID lookups (Account-V1) | **Regional** routing | `americas` | `https://americas.api.riotgames.com` |

(LAS is sometimes written `LA2` in platform-routed URLs and `LAS` in older docs/wrappers — they're the same server. Latin America North, `LA1`/`LAN`, is a different server and not what you want here.)

## 2. The Core Endpoints You'll Use

1. **`GET /riot/account/v1/accounts/by-riot-id/{gameName}/{tagLine}`** (americas routing) — turn a Riot ID ("gameName#tagLine," what you'll type into the admin page) into a `puuid`. Do this once per player, when they're added via the admin page, and store the `puuid` — everything else keys off it.
2. **`GET /lol/league/v4/entries/by-puuid/{puuid}`** (LA2/platform routing) — current rank entries for that player. Filter the response for `queueType == "RANKED_SOLO_5x5"` to get tier, rank (division), leaguePoints, wins, losses. This is what refreshes the cached snapshot on `players`.
3. **`GET /lol/match/v5/matches/by-puuid/{puuid}/ids?queue=420&start=0&count=20`** (americas routing) — the player's most recent ranked solo match IDs, **newest first**. `queue=420` filters server-side to ranked solo/duo only, so you don't waste calls or storage on flex/normals/ARAM.
4. **`GET /lol/match/v5/matches/{matchId}`** (americas routing) — full match detail, including all 10 participants. Only call this for match IDs you haven't already stored (see §3).

## 3. Incremental Sync (don't re-fetch what you already have)

Because endpoint 3 above returns match IDs newest-first, the stop condition is simple and cheap:

```
for each tracked player:
    recent_ids = GET match ids (queue=420, count=20)   # 1 call
    for match_id in recent_ids:                        # walking newest → oldest
        if match_id already exists in `matches` table:
            break                                        # everything older is already synced — stop
        match_detail = GET match by id                   # 1 call, only for genuinely new matches
        if match_detail is a remake or early surrender:  # see §4
            skip (don't insert, but don't re-check it either — see note below)
            continue
        insert into matches + match_participants (10 rows)
    refresh rank snapshot via league-v4                 # 1 call
```

**Note on skipped (remade/early-ff) games:** even though you don't store them as a "counted" match, you should still record that you've *seen* that match ID somewhere lightweight (e.g. a minimal row, or a separate small "seen but excluded" set) — otherwise, since it never appears in your `matches` table, the loop above will never hit its stop condition on it and will re-fetch that same excluded match's detail on every sync forever. The cheapest fix: still insert a row into `matches` for every match you look at (even excluded ones), but add a boolean column like `excluded` (or simply don't insert `match_participants` for it) so the home/history pages just filter those out, while the incremental-stop-check still works against the full `matches` table. This is a small addition to the schema in `03_DATABASE_SCHEMA.md` if you want it — worth doing before you write the sync job, not after you notice the bug.

**A 20-match window is a starting point, not a hard rule** — if someone's on a long session and plays more than 20 ranked games between syncs (unlikely with a once-daily cron, but possible after a manual-sync gap), bump `count` or add simple pagination via the `start` parameter until you hit an already-known match ID or run out of results.

## 4. Filtering Out Remakes and Early Surrenders

You flagged not knowing how Riot represents remakes — good instinct to check, because the naive approach (checking `game_duration < 15 minutes`) is close but not quite right on its own.

Riot's match detail response includes a per-participant boolean field: **`info.participants[i].gameEndedInEarlySurrender`**. This is `true` for both:
- **Remakes** — games ended by (near-)unanimous early vote, typically within the first few minutes, with no stat impact and no win/loss recorded for anyone.
- **Early surrenders ("FF15")** — a genuine surrender vote that passed before the 15-minute mark.

**Use this flag directly as your exclusion check**, rather than re-deriving it from duration:

```
if match_detail.info.participants[i].gameEndedInEarlySurrender == true:
    exclude this match  # for every participant, not just player i — it's a game-level outcome
```

This single check covers exactly what you described ("remake and early ffs should not count... surrender before 15 minute games or not win nor loss game") without you having to guess at exact time thresholds, which Riot doesn't publicly commit to and which have shifted across patches historically.

As a defensive double-check (not a replacement), you can additionally verify `info.gameDuration` (in seconds) is above some sane floor like 300s — but treat `gameEndedInEarlySurrender` as the source of truth, since it's what Riot itself uses to mark these games.

Also filter defensively on `info.queueId == 420` even though your match-ID query already requested queue 420 — cheap insurance against any Riot response quirk.

## 5. Rate Limits & Key Type

You'll be using a **personal API key** from the [Riot Developer Portal](https://developer.riotgames.com/) — this is the correct (and only permitted) key type for a small private-group tool like this; production keys are for public products and require Riot's review, which you don't need or want here.

- **Rate limit:** 20 requests/second, 100 requests/2 minutes, enforced per region.
- **Expiry:** personal/dev keys expire every 24 hours and must be manually regenerated from the portal, then updated in your app. This is exactly why the navbar popup (PRD §4.1) matters — see `02_ARCHITECTURE.md` §4 for how expiry is detected and where the key is stored.

**Rough math for your group:** for N tracked players, one sync costs roughly `N × (1 match-id call + 1 league call + however many genuinely-new match-detail calls)`. For 5-6 friends syncing once a day, even a busy day (say 10 new games each) lands around `6 × (1 + 1 + 10) ≈ 72` calls — comfortably inside the 100/2min ceiling, but add a small delay (50-100ms) between calls in your sync loop as cheap insurance against bursting the 20/second limit, especially since the manual-sync button could in theory be mashed by someone impatient.

## 6. Champion Icons (Data Dragon / DDragon)

1. Get the current patch version: `GET https://ddragon.leagueoflegends.com/api/versions.json` → the **first** element in the returned array is the latest version string (e.g. `"26.15.1"`). Cache this for a day rather than fetching it on every page render.
2. Get the champion ID → DDragon key mapping: `GET https://ddragon.leagueoflegends.com/cdn/{version}/data/en_US/champion.json`. **Use this mapping rather than assuming `championName` from match data matches DDragon's internal key** — a few champions (e.g. Wukong → `MonkeyKing`, Kai'Sa → `Kaisa`, Renata Glasc → `Renata`) have internal DDragon keys that differ from their in-game display name/API string, and this mapping is the only fully reliable way to bridge that.
3. Champion icon URL: `https://ddragon.leagueoflegends.com/cdn/{version}/img/champion/{ddragonKey}.png`

Since `champion_id` (a stable integer) is stored on every `match_participants` row, you can build this id → ddragon-key lookup once per patch version and reuse it everywhere, rather than storing image URLs directly in the database (which would go stale every patch).

**Rank emblems:** DDragon doesn't officially host ranked-tier emblem images (those live in the client's own assets, not the public CDN). Recommendation: render rank as a styled text badge in your own design system (tier name + division + LP, colored per your palette) rather than depending on an unofficial third-party mirror for emblem art. Simpler, and it won't break.

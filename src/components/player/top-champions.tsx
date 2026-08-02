import { formatKdaRatio } from "@/lib/format";
import { championDisplayName, championIconUrl, type ChampionInfo } from "@/lib/ddragon";
import { championKdaRatio, championWinRate, type ChampionAgg } from "@/lib/champion-stats";

// The player page's champion strip: their most-played champions, ordered by
// games. Deliberately lighter than /champions' full tierlist — no sort toggle,
// no per-minute columns — because this is the "what do they actually play"
// glance, and the tierlist behind the header link is the version you go to
// when you want to compare.
//
// A Server Component: the parent already has every row it needs, so there is
// nothing here that requires the client.

export function TopChampions({
  champions,
  version,
  championMap,
}: {
  /** Already truncated by the caller — topChampionsByPlayer(rows, TOP_CHAMPION_COUNT). */
  champions: ChampionAgg[];
  version: string;
  championMap: Map<number, ChampionInfo>;
}) {
  if (champions.length === 0) {
    return <p className="text-sm text-grey-mid">No tracked games yet.</p>;
  }

  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
      {champions.map((champ) => {
        const url = championIconUrl(champ.championId, version, championMap);
        // champion_name holds Riot's internal codename ("MonkeyKing"), so it
        // has to be resolved before it reaches a person — see lib/ddragon.ts.
        const name = championDisplayName(champ.championId, championMap, champ.championName);
        const winRate = championWinRate(champ);
        const losses = champ.games - champ.wins;

        return (
          <li
            key={champ.championId}
            className="flex flex-col items-center gap-1 rounded-lg bg-bg-tertiary px-2 py-3 text-center"
          >
            {url ? (
              <img src={url} alt={name} title={name} className="h-11 w-11 rounded-md" />
            ) : (
              <div className="h-11 w-11 rounded-md bg-gold-muted" />
            )}

            <p className="w-full truncate text-xs font-medium text-white" title={name}>
              {name}
            </p>

            <p
              className={`font-heading tabular-nums text-lg font-semibold ${
                winRate >= 50 ? "text-win" : "text-loss"
              }`}
            >
              {winRate}%
            </p>

            {/* The record next to the rate, so a 100% off two games is visibly
                off two games — same honesty rule as the dashboard award tiles. */}
            <p className="tabular-nums text-[11px] text-grey-light">
              {champ.wins}W {losses}L
            </p>
            <p className="tabular-nums text-[11px] text-grey-mid">
              {formatKdaRatio(championKdaRatio(champ))} KDA
            </p>
          </li>
        );
      })}
    </ul>
  );
}

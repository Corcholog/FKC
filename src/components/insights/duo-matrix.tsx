import { duoWinRate, type DuoRecord } from "@/lib/duo-stats";

// A CSS-grid matrix, not a Recharts chart — this is a small table of numbers
// where the exact value matters more than the shape, and every cell is labelled.
//
// Colour is diverging around 50% (the point where a duo stops helping): one
// hue above, one below, neutral grey in the middle. The number is always
// printed, so colour is reinforcement rather than the only encoding.

export type MatrixPlayer = {
  id: string;
  display_name: string;
};

function cellTone(winRate: number, games: number) {
  if (games === 0) return "bg-bg-tertiary text-grey-mid";
  if (winRate >= 60) return "bg-win/20 text-win";
  if (winRate <= 40) return "bg-loss/20 text-loss";
  return "bg-bg-tertiary text-white";
}

export function DuoMatrix({
  players,
  duos,
}: {
  players: MatrixPlayer[];
  duos: DuoRecord[];
}) {
  if (players.length < 2) {
    return (
      <p className="py-6 text-center text-sm text-grey-mid">
        Needs at least two tracked players.
      </p>
    );
  }

  const byPair = new Map<string, DuoRecord>();
  for (const duo of duos) {
    byPair.set(`${duo.a}|${duo.b}`, duo);
    byPair.set(`${duo.b}|${duo.a}`, duo);
  }

  const initials = (name: string) => name.slice(0, 2).toUpperCase();

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] border-separate border-spacing-0.5 text-sm">
        <thead>
          <tr>
            <th className="w-24" />
            {players.map((p) => (
              <th
                key={p.id}
                scope="col"
                title={p.display_name}
                className="px-1 pb-1 text-center text-[11px] font-medium text-grey-light"
              >
                {initials(p.display_name)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {players.map((row) => (
            <tr key={row.id}>
              <th
                scope="row"
                className="max-w-24 truncate pr-2 text-right text-xs font-medium text-grey-light"
              >
                {row.display_name}
              </th>
              {players.map((col) => {
                if (row.id === col.id) {
                  return <td key={col.id} className="rounded bg-bg-primary/60" />;
                }

                const duo = byPair.get(`${row.id}|${col.id}`);
                const games = duo?.games ?? 0;
                const winRate = duo ? duoWinRate(duo) : 0;

                return (
                  <td
                    key={col.id}
                    title={`${row.display_name} + ${col.display_name}: ${
                      games === 0 ? "never queued together" : `${duo!.wins}W / ${games - duo!.wins}L`
                    }`}
                    className={`rounded px-1 py-1.5 text-center tabular-nums ${cellTone(winRate, games)}`}
                  >
                    {games === 0 ? (
                      <span className="text-xs">—</span>
                    ) : (
                      <>
                        <span className="text-xs font-medium">{winRate}%</span>
                        <span className="block text-[10px] text-grey-mid">{games}g</span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

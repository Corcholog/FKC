import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export type AwardPlayer = {
  slug: string;
  display_name: string;
  avatar_url: string | null;
};

type Tone = "good" | "bad" | "neutral";

const TONE_CLASS: Record<Tone, string> = {
  good: "text-win",
  bad: "text-loss",
  neutral: "text-white",
};

export function AwardTile({
  label,
  player,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  player: AwardPlayer | null;
  value: string;
  sub?: string;
  tone?: Tone;
}) {
  const body = (
    <>
      <p className="text-[11px] tracking-wide text-grey-light uppercase">{label}</p>

      <p className={`font-heading tabular-nums text-2xl font-semibold ${TONE_CLASS[tone]}`}>
        {player ? value : "—"}
      </p>

      {player ? (
        <div className="flex min-w-0 items-center gap-2">
          <Avatar size="sm">
            {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
            <AvatarFallback className="text-[10px]">
              {player.display_name.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <p className="min-w-0 truncate text-sm text-white">{player.display_name}</p>
        </div>
      ) : (
        <p className="text-sm text-grey-mid">No games yet</p>
      )}

      {player && sub && <p className="tabular-nums text-xs text-grey-mid">{sub}</p>}
    </>
  );

  // panel-hex's hover glow is keyed on `a.panel-hex:hover`, so the class has to
  // sit on the anchor itself — same as MatchRow. Unclaimed awards render as a
  // plain div since there's no player page to link to.
  const className = "panel-hex panel-hex-clip flex flex-col items-start gap-1 p-3";

  if (!player) return <div className={className}>{body}</div>;

  return (
    <Link href={`/player/${player.slug}`} className={className}>
      {body}
    </Link>
  );
}

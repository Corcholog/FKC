import type { ReactNode } from "react";
import { formatRelativeTime } from "@/lib/format";
import { avatarTint } from "@/lib/avatar-tint";
import type { TierListEntry } from "@/lib/loaders/tierlists";
import type { TierChampion } from "@/lib/tierlist";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { TierListExportNode } from "@/components/tierlist/tier-list-export-node";
import { TierListView } from "@/components/tierlist/tier-list-view";

// Everyone's tier list, stacked — /tierlists and /demo/tierlists.
//
// `actionsFor` is a slot, the same shape as MatchesList's `notesFor`. Everything
// that can change a list — Edit, Create, Delete — is a private-only control, and
// handing this component a `demo` boolean to hide them behind would put the
// public page one forgotten branch away from rendering a delete button. The demo
// passes a function that returns only the PNG export, which writes nothing.
//
// The export node stays on both sides: it renders off-screen, is captured
// entirely in the browser, and its filename comes from the slug — which on the
// demo is already the alias.
export function TierListsBoard({
  entries,
  championsById,
  version,
  actionsFor,
}: {
  entries: TierListEntry[];
  championsById: Map<number, TierChampion>;
  version: string;
  actionsFor: (entry: TierListEntry) => ReactNode;
}) {
  return (
    <>
      {entries.map((entry) => {
        const { player, list, laneLabel, stats } = entry;

        return (
          <section key={player.id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar size="lg">
                {player.avatar_url && <AvatarImage src={player.avatar_url} alt="" />}
                <AvatarFallback style={avatarTint(player.display_name)}>
                  {player.display_name.slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="mr-auto">
                <h2 className="font-heading text-lg font-semibold text-white">
                  {player.display_name}
                  {/* Named, not just implied by position — otherwise the
                      ordering down the page looks arbitrary. */}
                  <span className="ml-2 text-xs font-normal tracking-wide text-grey-mid uppercase">
                    {laneLabel}
                  </span>
                </h2>
                {list && (
                  <p className="text-xs text-grey-mid">
                    Edited {formatRelativeTime(list.updatedAt)}
                    {list.editedBy ? ` by ${list.editedBy}` : ""}
                  </p>
                )}
              </div>

              {actionsFor(entry)}
            </div>

            {list ? (
              <>
                <TierListView
                  tiers={list.tiers}
                  champions={championsById}
                  version={version}
                  stats={stats}
                />
                <TierListExportNode
                  id={`tierlist-${player.slug}`}
                  title={`${player.display_name} — champion tier list`}
                  subtitle={`Patch ${version}`}
                  tiers={list.tiers}
                  champions={championsById}
                  version={version}
                />
              </>
            ) : (
              <div className="panel-hex p-6 text-center">
                <p className="text-sm text-grey-mid">
                  {player.display_name} hasn&apos;t made a tier list yet.
                </p>
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

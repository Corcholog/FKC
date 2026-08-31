import { createAdminClient } from "@/lib/supabase/admin";
import { countRosterGamesSince, MIN_NEW_GAMES } from "@/lib/summary";
import { formatRelativeTime } from "@/lib/format";
import {
  DEMO_SUMMARY_DRAFT_SOURCE,
  DEMO_SUMMARY_SOURCE,
  DEMO_TEAM_SUMMARY_DRAFT_SOURCE,
  DEMO_TEAM_SUMMARY_ROW_ID,
  DEMO_TEAM_SUMMARY_SOURCE,
} from "@/lib/summary-analyst";
import {
  DemoSummariesForm,
  type DemoSummaryDraft,
} from "@/components/settings/demo-summaries-form";
import { SectionCard } from "@/components/section-card";

export default async function SettingsDemoPage() {
  // Admin client: demo_aliases and demo_text are both authenticated-only at the
  // RLS level and have no policy for the signed-in role, by design — they are a
  // back-office mapping, not app data. This page is the back office.
  const admin = createAdminClient();
  const [{ data: aliasRows }, { data: textRows }] = await Promise.all([
    admin.from("demo_aliases").select("player_id, alias").order("alias"),
    admin
      .from("demo_text")
      .select("source, row_id, body, updated_at")
      .in("source", [
        DEMO_SUMMARY_SOURCE,
        DEMO_SUMMARY_DRAFT_SOURCE,
        DEMO_TEAM_SUMMARY_SOURCE,
        DEMO_TEAM_SUMMARY_DRAFT_SOURCE,
      ]),
  ]);

  const rowsBySource = (source: string) =>
    new Map(
      (textRows ?? [])
        .filter((r) => r.source === source)
        .map((r) => [
          r.row_id as string,
          { body: (r.body as string) ?? "", updatedAt: (r.updated_at as string) ?? null },
        ]),
    );
  const draftRows = rowsBySource(DEMO_SUMMARY_DRAFT_SOURCE);
  const publishedRows = rowsBySource(DEMO_SUMMARY_SOURCE);
  const teamPublished = rowsBySource(DEMO_TEAM_SUMMARY_SOURCE).get(DEMO_TEAM_SUMMARY_ROW_ID);

  // How far the live recap has drifted from the roster it describes.
  //
  // Nothing regenerates it on a schedule — public prose is written by a person
  // (ADR-039) — so the only thing that can prompt a rewrite is seeing the number
  // here. Counted only for the recap: it is the row that dates fastest, being
  // about this week's games and current streaks, and the one on /demo's front
  // page. Nothing live to be stale means nothing to show.
  //
  // A count, not a fetch, so it costs no rows; nine of these (one per player)
  // would be a different conversation, which is why the players don't get one.
  const gamesSinceRecap =
    teamPublished && teamPublished.body.trim() && teamPublished.updatedAt
      ? await countRosterGamesSince(admin, teamPublished.updatedAt)
      : null;

  // The draft is the working copy. Falling back to the published text covers
  // rows published before drafts existed as a separate thing — and, generally,
  // an editor that opened empty on top of live text would be a trap: pressing
  // Publish would blank the demo.
  //
  // `updatedAgo` is formatted here rather than in the form because the form is a
  // client component: formatting there runs once on the server and again at
  // hydration, off two different clocks.
  const toDraft = (
    kind: DemoSummaryDraft["kind"],
    rowId: string,
    label: string,
    draft?: { body: string; updatedAt: string | null },
    published?: { body: string; updatedAt: string | null },
  ): DemoSummaryDraft => {
    const updatedAt = draft?.updatedAt ?? published?.updatedAt ?? null;
    return {
      kind,
      playerId: rowId,
      alias: label,
      body: draft?.body ?? published?.body ?? "",
      updatedAgo: updatedAt ? formatRelativeTime(updatedAt) : null,
      publishedBody: published?.body ?? "",
      gamesSincePublished: kind === "team" ? gamesSinceRecap : null,
      worthRewriting: kind === "team" && (gamesSinceRecap ?? 0) >= MIN_NEW_GAMES,
    };
  };

  // The recap leads the list, the way it leads a generation run: it's the one on
  // /demo's front page, and it's the only row here that isn't about one person.
  const demoDrafts: DemoSummaryDraft[] = [
    toDraft(
      "team",
      DEMO_TEAM_SUMMARY_ROW_ID,
      "Clan recap",
      rowsBySource(DEMO_TEAM_SUMMARY_DRAFT_SOURCE).get(DEMO_TEAM_SUMMARY_ROW_ID),
      teamPublished,
    ),
    ...(aliasRows ?? []).map((r) => {
      const playerId = r.player_id as string;
      return toDraft(
        "player",
        playerId,
        r.alias as string,
        draftRows.get(playerId),
        publishedRows.get(playerId),
      );
    }),
  ];

  return (
    <SectionCard
      title="Demo summaries"
      caption="Published text is what /demo shows a stranger. Drafts are private until published."
    >
      <DemoSummariesForm drafts={demoDrafts} />
    </SectionCard>
  );
}

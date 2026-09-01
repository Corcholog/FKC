import type { NextConfig } from "next";

const supabaseHostname = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      ...(supabaseHostname
        ? [
            {
              protocol: "https" as const,
              hostname: supabaseHostname,
              pathname: "/storage/v1/object/public/**",
            },
          ]
        : []),
      {
        protocol: "https" as const,
        hostname: "ddragon.leagueoflegends.com",
        pathname: "/cdn/**",
      },
    ],
  },

  // Every route this app has ever had, pointed at where it lives now.
  //
  // Permanent because these paths were bookmarked and pasted into Discord for a
  // season, and a 404 on a link somebody shared is a worse answer than a
  // redirect that outlives its usefulness.
  //
  // Each one goes straight to its final destination rather than through the
  // intermediate name it had in between — /scrims/drafts was /team/drafts before
  // it was /prep/picks, and chaining two redirects to say so would cost a round
  // trip to preserve a path nobody typed.
  //
  // **Order matters**: Next matches these in order, so every named child is
  // listed before the parameterised sibling that would otherwise swallow it.
  async redirects() {
    const move = (from: string, to: string) => ({ source: from, destination: to, permanent: true });
    return [
      // The section that became the app (ADR-050). /team was the competitive
      // half while there was also a clan half; now it is the front page.
      move("/team", "/"),
      move("/team/roster", "/players"),
      move("/team/players", "/players"),
      move("/team/matches/new", "/matches/new"),
      move("/team/matches/:id/edit", "/matches/:id/edit"),
      move("/team/matches/:id", "/matches/:id"),
      move("/team/matches", "/matches"),
      move("/team/scouting", "/prep/scouting"),
      move("/team/drafts", "/prep/picks"),
      move("/team/opponents/:slug", "/prep/opponents/:slug"),
      move("/team/opponents", "/prep/opponents"),

      // The clan half. /roster and /champions are gone rather than moved: the
      // roster is /players, and a champion pool is a section of one player's
      // page now that there are five people rather than nine.
      move("/roster", "/players"),
      move("/champions", "/players"),
      move("/player/:slug", "/players/:slug"),

      // /insights was the cross-player section (ADR-052). Everything on it
      // was either about nine people or a chart that reads better on the
      // front page, which is where the one survivor went.
      move("/insights", "/"),

      // Draft prep and tier lists became tabs of one section.
      move("/prep", "/prep/draft"),
      move("/draft/champions", "/prep/champions"),
      move("/draft/comps", "/prep/comps"),
      move("/draft/synergies", "/prep/synergies"),
      move("/draft/counters", "/prep/counters"),
      move("/draft", "/prep/draft"),
      move("/tierlists/:slug", "/prep/tierlists/:slug"),
      move("/tierlists", "/prep/tierlists"),

      // Three Settings tabs are gone: the demo (migration 027), Main team —
      // whose only control was assigning the five, which is a swap on the roster
      // rows now that the table *is* the team (028) — and AI, with the whole
      // Gemini layer (029).
      move("/settings/demo", "/settings"),
      move("/settings/team", "/settings"),
      move("/settings/ai", "/settings"),

      // The scrims section became the team section (migration 025), which then
      // became this. Two renames ago; still linked from a season of Discord.
      move("/scrims", "/"),
      move("/scrims/history", "/matches"),
      move("/scrims/new", "/matches/new"),
      move("/scrims/drafts", "/prep/picks"),
      // /scrims/team was the filtered scouting view; "team" inside /team was
      // the old name's only real problem.
      move("/scrims/team", "/prep/scouting"),
      move("/scrims/opponents/:slug", "/prep/opponents/:slug"),
      move("/scrims/opponents", "/prep/opponents"),
      move("/scrims/:id/edit", "/matches/:id/edit"),
      move("/scrims/:id", "/matches/:id"),
    ];
  },
};

export default nextConfig;

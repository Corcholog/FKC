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

  // The scrims section became the team section (migration 025). These are
  // permanent because the old paths were bookmarked and pasted into Discord for
  // a season, and a 404 on a link somebody shared is a worse answer than a
  // redirect that outlives its usefulness.
  //
  // Order matters: /scrims/:id would otherwise swallow /scrims/history and
  // friends, sending them to /team/matches/history. Next matches these in
  // order, so every named child is listed before the catch-all.
  async redirects() {
    const move = (from: string, to: string) => ({ source: from, destination: to, permanent: true });
    return [
      move("/scrims", "/team"),
      move("/scrims/history", "/team/matches"),
      move("/scrims/new", "/team/matches/new"),
      move("/scrims/drafts", "/team/drafts"),
      // /scrims/team was the filtered scouting view; "team" inside /team was
      // the old name's only real problem.
      move("/scrims/team", "/team/scouting"),
      move("/scrims/opponents", "/team/opponents"),
      move("/scrims/opponents/:slug", "/team/opponents/:slug"),
      move("/scrims/:id/edit", "/team/matches/:id/edit"),
      move("/scrims/:id", "/team/matches/:id"),

      // The demo mirrors the private tree, so it mirrors the redirects.
      move("/demo/scrims", "/demo/team"),
      move("/demo/scrims/history", "/demo/team/matches"),
      move("/demo/scrims/drafts", "/demo/team/drafts"),
      move("/demo/scrims/team", "/demo/team/scouting"),
      move("/demo/scrims/opponents", "/demo/team/opponents"),
      move("/demo/scrims/opponents/:slug", "/demo/team/opponents/:slug"),
      move("/demo/scrims/:id", "/demo/team/matches/:id"),
    ];
  },
};

export default nextConfig;

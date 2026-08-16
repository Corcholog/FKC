import type { Metadata } from "next";
import { DemoNavbar } from "@/components/demo/demo-navbar";

// A sibling of the (app) route group, not a child, so none of the private
// layout's chrome or queries can reach in here: no sync_state read, no
// getSession(), no navbar carrying a Sync button and an account email.
//
// Everything under /demo reads through createPublicClient() (no session, so the
// JWT is `anon`) against the demo_* views from migration 018. Both halves of
// that are load-bearing and neither depends on this file — see the header of
// docs/migrations/018_demo_views.sql.

export const metadata: Metadata = {
  title: "SoloQ Tracker — public demo",
  description:
    "A League of Legends performance tracker for a full roster. Real match data, anonymized identities.",
  // The demo is a link you send someone, not a page that should rank. It also
  // means a search engine never caches a snapshot of the roster's numbers.
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <DemoNavbar />

      {/* Permanent, not dismissible. Someone landing on a deep link should not
          have to work out why the players are called Nova and Kite. */}
      <div className="border-b border-gold-muted/30 bg-gold-muted/10">
        <p className="mx-auto w-full max-w-4xl px-4 py-2 text-center text-xs text-grey-light sm:px-6">
          Public demo — real match data from a live roster, with player identities and
          avatars replaced. Nothing here can be edited.
        </p>
      </div>

      {children}
    </div>
  );
}

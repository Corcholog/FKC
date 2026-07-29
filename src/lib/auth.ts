import { cache } from "react";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type SessionPlayer = {
  id: string;
  slug: string;
  display_name: string;
};

export type Session = {
  supabase: SupabaseClient;
  user: User;
  /**
   * The roster player this login belongs to, or null for the shared viewer
   * account (which can read everything but owns no games, so writes no notes).
   */
  player: SessionPlayer | null;
};

/**
 * Throws if there's no session. Route protection already happens in proxy.ts,
 * so this is the second line of defence for server actions and route handlers.
 */
export async function requireSession(): Promise<{ supabase: SupabaseClient; user: User }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated.");
  return { supabase, user };
}

/**
 * The signed-in user plus the roster player they're linked to, or null when
 * signed out. cache() dedupes the getUser() + players lookup across a render.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: player } = await supabase
    .from("players")
    .select("id, slug, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  return { supabase, user, player: (player as SessionPlayer | null) ?? null };
});

/** Same as getSession() but throws when signed out — for server actions. */
export async function requireSessionPlayer(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Not authenticated.");
  return session;
}

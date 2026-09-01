"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INVALID_CREDENTIALS = "Invalid display name/email or password.";

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const trimmed = identifier.trim();

    // A display name is easier to remember than an email, but auth.users only
    // has an email column — resolve the display name to its linked account's
    // email first. Text with an "@" is treated as an email and used as-is.
    let email = trimmed;
    if (!trimmed.includes("@")) {
      const { data: resolved, error: resolveError } = await supabase.rpc("resolve_login_email", {
        p_display_name: trimmed,
      });
      if (resolveError || !resolved) {
        // Same message as a wrong password — don't reveal whether the name exists.
        setError(INVALID_CREDENTIALS);
        setLoading(false);
        return;
      }
      email = resolved;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError(INVALID_CREDENTIALS);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-border bg-bg-secondary p-8 shadow-[0_0_20px_-4px_rgba(200,155,60,0.12)]"
      >
        <h1 className="font-heading mb-6 text-xl font-semibold text-white">Fake Clan Team Tracker</h1>

        <div className="mb-4 flex flex-col gap-1.5">
          <Label htmlFor="identifier" className="text-xs text-grey-light">
            Display name or email
          </Label>
          <Input
            id="identifier"
            type="text"
            autoComplete="username"
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
        </div>

        <div className="mb-6 flex flex-col gap-1.5">
          <Label htmlFor="password" className="text-xs text-grey-light">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="mb-4 text-sm text-loss">{error}</p>}

        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </main>
  );
}

import { getSession } from "@/lib/auth";
import { ChangePasswordForm } from "@/components/account/change-password-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountPage() {
  const session = await getSession();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold text-white">Account</h1>
        <p className="text-sm text-grey-light">{session?.user.email}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base tracking-wide text-grey-light uppercase">
            Player
          </CardTitle>
        </CardHeader>
        <CardContent>
          {session?.player ? (
            <p className="text-sm text-white">
              You&apos;re signed in as{" "}
              <span className="font-medium text-gold-bright">{session.player.display_name}</span> — you
              can add notes to your own games.
            </p>
          ) : (
            <p className="text-sm text-grey-light">
              This login isn&apos;t linked to a roster player, so it can read everything but
              can&apos;t write notes. Ask an admin to create a player login for you in Settings.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-base tracking-wide text-grey-light uppercase">
            Change password
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </main>
  );
}

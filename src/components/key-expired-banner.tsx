import Link from "next/link";

export function KeyExpiredBanner() {
  return (
    <div className="border-b border-warning bg-warning-bg px-4 py-2 text-center text-sm text-warning sm:px-6">
      Riot API key is invalid or expired — sync is stopped until it's refreshed.{" "}
      <Link href="/admin" className="font-medium underline hover:no-underline">
        Update it in Admin
      </Link>
      .
    </div>
  );
}

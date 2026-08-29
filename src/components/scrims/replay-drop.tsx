"use client";

import { useId, useState } from "react";
import { FileUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Replays are named after the game, not the block, so the only way to know
 * which one is game 1 is when it was written. The client writes a replay the
 * moment the game ends, so the file times are the order they were played in.
 */
export function sortReplaysByPlayOrder(files: File[]): File[] {
  return [...files].sort(
    (a, b) => a.lastModified - b.lastModified || a.name.localeCompare(b.name),
  );
}

/** Anything else dropped alongside them is reported and skipped, not guessed at. */
export function partitionReplays(files: File[]): { replays: File[]; ignored: string[] } {
  const replays: File[] = [];
  const ignored: string[] = [];
  for (const file of files) {
    if (file.name.toLowerCase().endsWith(".rofl")) replays.push(file);
    else ignored.push(file.name);
  }
  return { replays, ignored };
}

/**
 * The drop target above the games — the main way a block gets entered.
 *
 * Deliberately says out loud that the file stays put. A replay is 15MB of
 * somebody's game and this reads a 120KB slice of it in the browser; nothing is
 * uploaded and nothing is kept, and that is worth stating where the file is
 * handed over rather than in a doc nobody opens.
 */
export function ReplayDropzone({
  onFiles,
  busy,
}: {
  onFiles: (files: File[]) => void;
  busy: boolean;
}) {
  const inputId = useId();
  const [over, setOver] = useState(false);

  return (
    <label
      htmlFor={inputId}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        onFiles([...e.dataTransfer.files]);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed px-4 py-6 text-center transition-colors",
        over ? "border-gold bg-gold/10" : "border-border hover:border-gold-muted",
        busy && "pointer-events-none opacity-60",
      )}
    >
      {busy ? (
        <Loader2 className="size-5 animate-spin text-gold" />
      ) : (
        <FileUp className="size-5 text-gold" />
      )}
      <span className="text-sm font-medium text-white">
        {busy ? "Reading replays…" : "Drop the block's .rofl replays here"}
      </span>
      <span className="max-w-prose text-xs text-grey-mid">
        Fills the games in order — champions, K/D/A, CS, duration, patch, who won and which side we
        were on. Bans aren&apos;t recorded in a replay, so those stay yours to enter. Everything is
        read in your browser: the file isn&apos;t uploaded and isn&apos;t stored.
      </span>
      <input
        id={inputId}
        type="file"
        accept=".rofl"
        multiple
        disabled={busy}
        className="sr-only"
        onChange={(e) => {
          onFiles([...(e.target.files ?? [])]);
          // Cleared so picking the same file twice in a row still fires a
          // change — re-importing one game is a normal thing to want.
          e.target.value = "";
        }}
      />
    </label>
  );
}

/** The same thing for one game, for when only that one needs redoing. */
export function ReplayGameButton({
  onFile,
  busy,
  label,
}: {
  onFile: (file: File) => void;
  busy: boolean;
  label: string;
}) {
  const inputId = useId();

  return (
    <label
      htmlFor={inputId}
      title="Fill this game in from its replay"
      className={cn(
        "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 text-xs font-medium text-grey-light transition-colors hover:border-gold-muted hover:text-white",
        busy && "pointer-events-none opacity-60",
      )}
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : <FileUp className="size-3.5" />}
      Replay
      <input
        id={inputId}
        type="file"
        accept=".rofl"
        disabled={busy}
        aria-label={label}
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </label>
  );
}

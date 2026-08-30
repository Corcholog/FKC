"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { updateOpponentNotes } from "@/app/(app)/team/actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Free-text scouting notes on one opponent — the same call as clan_profile's
 * context field: the useful version of "what do we know about this team" is
 * prose, not columns.
 */
export function OpponentNotesForm({
  opponentId,
  initialNotes,
}: {
  opponentId: string;
  initialNotes: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [saving, startSaving] = useTransition();
  const [savedNotes, setSavedNotes] = useState(initialNotes);
  const dirty = notes !== savedNotes;

  function save() {
    const snapshot = notes;
    startSaving(async () => {
      const result = await updateOpponentNotes(opponentId, snapshot);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setSavedNotes(snapshot);
      toast.success("Notes saved.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="opponent-notes">Scouting notes</Label>
      <Textarea
        id="opponent-notes"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="How they draft, who carries, what they do on blue side."
        rows={3}
      />
      <Button
        type="button"
        size="sm"
        onClick={save}
        disabled={!dirty || saving}
        className="self-start"
      >
        {saving ? <Loader2 className="animate-spin" /> : <Save />}
        {saving ? "Saving…" : "Save notes"}
      </Button>
    </div>
  );
}

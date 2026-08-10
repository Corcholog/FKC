"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Asks before leaving a page with work that hasn't been saved.
 *
 * There are two ways off a page and they need different handling:
 *
 *   * **Out of the site** — reload, tab close, a typed address. Only the
 *     browser's own `beforeunload` prompt can cover that; no script gets to
 *     draw anything at that point, and the wording is the browser's.
 *   * **A link inside the app** — the one that actually loses work, because it
 *     looks harmless. A client-side navigation never unloads the document, so
 *     `beforeunload` never fires, and the App Router publishes no route-change
 *     event to hook. (`next/link`'s `onNavigate` can cancel one, but it's a
 *     prop on each link, and the links that lead away from an editor live in
 *     the navbar, not in the editor.) So the click is caught on the way down
 *     instead, and re-issued as a `router.push` if the answer is yes.
 *
 * The back button is deliberately *not* covered. Intercepting it means pushing
 * a decoy history entry, and the App Router keeps its own state in history —
 * fighting it there trades a rare loss for a browser that can't go back, which
 * is a worse bug than the one being fixed.
 */
export function UnsavedChangesGuard({
  when,
  title = "Leave without saving?",
  description = "The changes on this page haven't been saved, and leaving drops them.",
}: {
  /** Armed only while there's something to lose. */
  when: boolean;
  title?: string;
  description?: string;
}) {
  const router = useRouter();
  /** Where the intercepted click was heading, or null when nothing is pending. */
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!when) return;

    function beforeUnload(event: BeforeUnloadEvent) {
      // preventDefault() is the whole API — the prompt's text has been the
      // browser's own, unstylable and unsettable, since 2017.
      event.preventDefault();
    }

    function interceptLink(event: MouseEvent) {
      // Anything the browser handles its own way — a middle click, a new tab, a
      // download — leaves this page open, so there's nothing to warn about.
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]") as
        | HTMLAnchorElement
        | null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const url = new URL(anchor.href, window.location.href);
      // Another origin unloads the document, which is beforeUnload's job. A
      // link back to this same page (or to a fragment of it) isn't leaving.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return;
      }

      // Capture phase: React's delegated handler and next/link's own are both
      // downstream of here, and by the time either has run the navigation has
      // already started.
      event.preventDefault();
      event.stopPropagation();
      setPending(`${url.pathname}${url.search}${url.hash}`);
    }

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", interceptLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", interceptLink, true);
    };
  }, [when]);

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          {/* Staying is the safe answer, so it's the plain one on the left and
              the destructive styling goes on the button that drops the work. */}
          <Button type="button" variant="outline" onClick={() => setPending(null)}>
            Keep editing
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              const href = pending;
              setPending(null);
              // Not intercepted on the way out: the guard only ever watches
              // clicks, and this is the same navigation the click asked for.
              if (href) router.push(href);
            }}
          >
            Leave
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

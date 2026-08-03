"use client";

import { useState } from "react";
import { toPng } from "html-to-image";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

// The page background, so the PNG isn't transparent where the board's own
// panels don't reach.
const EXPORT_BACKGROUND = "#0a0d12";

/**
 * Renders the element with the given id to a PNG and downloads it.
 *
 * Takes an element id rather than a ref because the overview page is a server
 * component and can't hand one across the boundary. Whatever it points at is
 * captured as-is, which is why the export target is always the read-only
 * TierListView — no gear buttons or drop-zone chrome to strip out.
 */
export function DownloadPngButton({
  targetId,
  fileName,
  label = "PNG",
  variant = "outline",
}: {
  targetId: string;
  fileName: string;
  label?: string;
  variant?: "outline" | "ghost" | "secondary";
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    const node = document.getElementById(targetId);
    if (!node) {
      toast.error("Nothing to export.");
      return;
    }

    setBusy(true);
    try {
      // Without this the first capture can serialize before the display font
      // has loaded and the labels come out in the fallback face.
      await document.fonts.ready;

      const options = {
        pixelRatio: 2,
        backgroundColor: EXPORT_BACKGROUND,
        // Anything the board marks as chrome stays out of the image.
        filter: (element: HTMLElement) => !element.dataset?.exportHide,
      };

      // html-to-image's first pass often serializes before the champion icons
      // have finished inlining, producing blank squares — the standard fix is
      // to throw the first result away and capture again from the now-warm
      // image cache.
      await toPng(node, options);
      const dataUrl = await toPng(node, options);

      const link = document.createElement("a");
      link.download = fileName;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export the image.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button type="button" size="sm" variant={variant} onClick={download} disabled={busy}>
      {busy ? <Loader2 className="animate-spin" /> : <Download />}
      {label}
    </Button>
  );
}

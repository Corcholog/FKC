"use client";

// Last-resort boundary: this replaces the root layout, so it only fires when
// the failure is in the root layout itself or in (app)/layout.tsx — the two
// places (app)/error.tsx can't reach.
//
// Per Next's docs, a global-error renders its own document and does NOT get
// globals.css, so none of the app's tokens or Tailwind classes are available
// here. Everything is inline, with the hextech palette hardcoded, because the
// alternative is an unstyled white page in a permanently dark app.
export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          padding: "2rem",
          textAlign: "center",
          background: "#0a0d12",
          color: "#f0e6d2",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <title>Something went wrong — Fake Clan SoloQ Tracker</title>

        <h1 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>
          The app failed to load
        </h1>
        <p style={{ margin: 0, fontSize: "0.875rem", color: "#a8a296" }}>
          This one took the whole page down rather than a single panel.
        </p>

        <button
          onClick={() => unstable_retry()}
          style={{
            marginTop: "0.5rem",
            padding: "0.5rem 1rem",
            fontSize: "0.875rem",
            fontWeight: 500,
            color: "#0a0d12",
            background: "#c89b3c",
            border: "none",
            borderRadius: "0.25rem",
            cursor: "pointer",
          }}
        >
          Try again
        </button>

        {error.digest ? (
          <p style={{ margin: 0, fontSize: "0.75rem", color: "#8a887f" }}>
            Error ID <code>{error.digest}</code>
          </p>
        ) : null}
      </body>
    </html>
  );
}

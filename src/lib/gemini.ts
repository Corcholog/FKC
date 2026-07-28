// Model ID checked live against ai.google.dev/pricing (2026-07-27) rather than
// trusted from memory — docs/00_README.md explicitly warns free-tier model
// names shift over time. Re-check there if this ever starts 404ing.
const MODEL = "gemini-3.6-flash";

export class GeminiApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function generateText(prompt: string, apiKey: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new GeminiApiError(res.status, `Gemini API request failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new GeminiApiError(502, "Gemini returned no summary text.");
  }
  return text.trim();
}

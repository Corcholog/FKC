export function playerSlug(gameName: string, tagLine: string): string {
  const norm = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${norm(gameName)}-${norm(tagLine)}`;
}

import { NotFoundPanel } from "@/components/not-found-panel";

// Catches every notFound() thrown inside (app): an unknown player slug, an
// unknown ?player= on /champions, an out-of-range /matches page. Renders inside
// the app layout, so the navbar stays.
export default function AppNotFound() {
  return <NotFoundPanel />;
}

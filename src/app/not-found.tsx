import { NotFoundPanel } from "@/components/not-found-panel";

// Root 404: URLs that match no route at all. Renders inside the root layout
// only, so there's no navbar here — hence the link home in the panel.
export default function NotFound() {
  return <NotFoundPanel />;
}

// The titled panel every stats section sits in.
//
// This markup — a Card whose only header is a small uppercase title, with an
// optional caption *below* the content rather than a CardDescription above it —
// was hand-rolled at every call site: six times on the player page alone. It is
// the app's de-facto section chrome, so it may as well be a component; the
// alternative is that the next section invents a seventh slightly-different
// version of it.
//
// `caption` is deliberately not CardDescription. A description renders under the
// title and reads as a subtitle; these captions state the sample gate or the
// caveat ("ranked from 3 games up") and only make sense once you've seen the
// numbers they qualify.

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SectionCard({
  title,
  caption,
  action,
  className,
  contentClassName = "flex flex-col gap-3",
  children,
}: {
  title: string;
  caption?: string;
  /** Rendered top-right in the header — a "View all →" link, typically. */
  action?: React.ReactNode;
  className?: string;
  contentClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="font-heading text-xs tracking-wide text-grey-light uppercase">
          {title}
        </CardTitle>
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent className={contentClassName}>
        {children}
        {caption && <p className="text-xs text-grey-mid">{caption}</p>}
      </CardContent>
    </Card>
  );
}

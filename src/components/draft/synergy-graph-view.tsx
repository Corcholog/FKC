"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Maximize, ZoomIn, ZoomOut } from "lucide-react";
import { championIconUrlById, type ChampionInfo } from "@/lib/ddragon";
import type { DraftCompRow } from "@/lib/draft/types";
import {
  BADGE_DEGREE,
  buildSynergyGraph,
  layoutSynergyGraph,
  NODE_RADIUS,
  type Point,
  type SynergyLayout,
} from "@/lib/draft/synergy-graph";
import { CHART_INK } from "@/components/charts/chart-theme";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Champion = ChampionInfo & { championId: number };

// Literal hexes, mirroring src/app/globals.css, for the reason documented at the
// top of charts/chart-theme.ts: these land in SVG *presentation attributes*,
// where custom-property support is not something to bet a whole view on.
const INK = {
  edge: "#3a4658",
  /** A group is a different kind of thing from a pair, so it gets the other accent. */
  group: "#0ac8b9", // --color-cyan
  ring: "#26303e", // --color-border
  plate: "#171e28", // --color-bg-tertiary
  surface: "#10151d", // --color-bg-secondary
};

/** Everything not touching the focused champion fades to this. */
const DIMMED = 0.14;

/**
 * How a group's region is painted — and why the fill and the outline are drawn
 * in two flat layers rather than one path each.
 *
 * A pool of any size has groups that share champions, so their regions overlap,
 * and `fill-opacity` *compounds*: two tints at 0.13 make 0.24, five make 0.51.
 * A busy pool therefore painted itself into a few large near-solid cyan slabs
 * whose brightness tracked how many regions happened to pile up in one spot —
 * which is not a fact about the synergies, and it is the loudest thing on the
 * screen. Putting every region's fill in one `<g opacity>` composites the
 * layer once and then fades it as a whole, so the tint means "grouped
 * synergies live here" at one strength no matter how many overlap.
 *
 * The outlines are the other half of the same problem, and get their own layer
 * for the same reason. They also thin out as the pool grows: five regions can
 * be told apart by their outlines and thirty cannot, at which point thirty
 * outlines are a scribble over the middle of the graph. Past `STROKE_FADE_TO`
 * the tint carries the regions and hovering carries the reading — a focused
 * champion's own regions are drawn at `GROUP_STROKE_FOCUS`, which is the state
 * where an individual synergy is meant to be legible anyway.
 */
const GROUP_FILL = 0.16;
const GROUP_STROKE = 0.5;
const GROUP_STROKE_FLOOR = 0.1;
const GROUP_STROKE_FOCUS = 0.65;
const STROKE_FADE_FROM = 6;
const STROKE_FADE_TO = 28;

function groupStrokeOpacity(count: number): number {
  const t = Math.min(Math.max((count - STROKE_FADE_FROM) / (STROKE_FADE_TO - STROKE_FADE_FROM), 0), 1);
  return GROUP_STROKE + (GROUP_STROKE_FLOOR - GROUP_STROKE) * t;
}

const NODE_CORNER = 4;

const MIN_SCALE = 0.15;
const MAX_SCALE = 3;
const BUTTON_ZOOM = 1.35;
/** Radians of nothing — how hard a wheel notch bites. */
const WHEEL_SENSITIVITY = 0.0016;
/** Pointer travel past which a drag stops counting as a click on a champion. */
const DRAG_SLOP = 4;

/**
 * The fit never scales *up*.
 *
 * Filtering to two synergies leaves a layout a few hundred pixels across, and
 * stretching that to fill the canvas blows two portraits up to the size of
 * playing cards — the view stops looking like the same view. Capped at 1, a
 * small result simply sits small and centred, drawn at exactly the size
 * `nodeRadius` asked for, and the user zooms in themselves if they want to.
 */
const MAX_FIT_SCALE = 1;

/** Before the canvas has been measured. Corrected on the first observer tick. */
const ASSUMED_SIZE = { w: 960, h: 620 };

type Transform = { k: number; x: number; y: number };
type Size = { w: number; h: number };

function fitTransform(layout: SynergyLayout, size: Size): Transform {
  const k = Math.min(size.w / layout.width, size.h / layout.height, MAX_FIT_SCALE);
  return { k, x: (size.w - layout.width * k) / 2, y: (size.h - layout.height * k) / 2 };
}

function polygonPath(points: Point[]): string {
  return `${points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}Z`;
}

/** Wheel deltas arrive in pixels, lines or pages depending on the device. */
function wheelPixels(event: WheelEvent): number {
  if (event.deltaMode === 1) return event.deltaY * 16;
  if (event.deltaMode === 2) return event.deltaY * 400;
  return event.deltaY;
}

/**
 * The saved synergies drawn as one picture, on a pannable, zoomable canvas.
 *
 * **What this shows that a wall of cards can't.** A champion in six saved
 * synergies is six separate cards scattered across a flex-wrap, and the pool has
 * a shape — a dense web around two or three hubs, plus a handful of pairs
 * connected to nothing — that no amount of scrolling makes visible. Here the
 * hubs are the ones with a count on them and lines running everywhere, and a
 * cluster that shares no champion with anything else is laid out on its own.
 *
 * **Nothing is written on the canvas.** Champion names were drawn under the
 * portraits and there is no density worth drawing this at where they do not
 * end up across somebody's face — placing them in the emptiest gap around each
 * portrait cut the collisions by three quarters and did not get rid of them.
 * The name is on the portrait's tooltip, in its `aria-label`, and in the rail
 * beside the graph as soon as a champion is hovered, which is where reading
 * happens anyway. Portraits are all one size for a related reason: the badge
 * says "in six of these" outright, and scaling the picture to say it again cost
 * every group region around a hub its spare space.
 *
 * **A pair is a line; three or more is a region, never a triangle.** The whole
 * reason `buildSynergyGraph` splits `edges` from `groups` is that drawing
 * `{Skarner, Syndra, Viktor}` as three lines would be indistinguishable from
 * three separately saved pairs, and this pool contains both shapes side by side.
 * The header of lib/draft/synergy-graph.ts is the long version.
 *
 * **It is read-only and there is no engine here either.** No suggested pairings,
 * no "champions you should save together", no scoring — the same call the
 * contextual panel makes and for the same reason. Everything drawn is a row
 * somebody saved; the layout is the only thing this component invents, and a
 * layout can be wrong in ways you can see.
 *
 * ## The canvas is a map, not a scrolling image
 *
 * It used to be an `overflow-x-auto` box holding an SVG scaled to the container
 * width, which was wrong at both ends: a big graph had to be scrolled to be
 * seen at all, and a filtered-down one was stretched until two champions filled
 * the panel. Now the canvas is a fixed viewport, the graph opens at whatever
 * scale fits inside it (never above 1:1 — see `MAX_FIT_SCALE`), and the wheel
 * zooms about the cursor while dragging pans, with no modifier and no click to
 * arm it.
 *
 * The wheel listener is attached natively with `{ passive: false }` rather than
 * through `onWheel`, because React registers its root wheel listener as passive
 * and `preventDefault` inside a passive listener does nothing — the page would
 * scroll away underneath the zoom.
 */
export function SynergyGraphView({
  comps,
  championById,
  version,
  controls,
}: {
  /** Already filtered by the toolbar — the graph draws exactly what the cards would. */
  comps: DraftCompRow[];
  championById: Map<number, Champion>;
  version: string;
  /**
   * The page's own filter controls, rendered at the top of the rail beside the
   * canvas. A slot rather than the page wrapping this component, because the
   * rail also carries the legend, the zoom controls and the readout — all three
   * of which belong to the graph and none of which the page knows about.
   */
  controls?: React.ReactNode;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = hovered ?? pinned;

  const graph = useMemo(() => buildSynergyGraph(comps), [comps]);
  const layout = useMemo(() => layoutSynergyGraph(graph), [graph]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size>(ASSUMED_SIZE);

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      if (box.width > 0 && box.height > 0) setSize({ w: box.width, h: box.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const fit = useMemo(() => fitTransform(layout, size), [layout, size]);

  /**
   * The user's own pan/zoom, tagged with the layout it was made against.
   *
   * Comparing that tag by identity is what resets the view when the filters
   * change: `layout` is memoised on `graph`, which is memoised on `comps`, so a
   * new set of rows is a new object and the stored transform stops applying —
   * no effect, no cleanup, and no render where a transform belonging to a graph
   * of twenty-eight champions is being applied to one of four.
   */
  const [panned, setPanned] = useState<{ layout: SynergyLayout; t: Transform } | null>(null);
  const view = panned?.layout === layout ? panned.t : fit;

  const [dragging, setDragging] = useState(false);
  // A drag that passed the slop, so pointerup shouldn't also pin a champion.
  const draggedRef = useRef(false);
  const dragRef = useRef<{ x: number; y: number; from: Transform } | null>(null);

  function zoomAbout(px: number, py: number, factor: number) {
    const k = Math.min(Math.max(view.k * factor, MIN_SCALE), MAX_SCALE);
    if (k === view.k) return;
    // Keep the graph point under the cursor exactly where it is.
    const gx = (px - view.x) / view.k;
    const gy = (py - view.y) / view.k;
    setPanned({ layout, t: { k, x: px - gx * k, y: py - gy * k } });
  }

  // The "latest ref" pattern: the wheel listener below is attached once, and
  // reads the current closure through here. Re-attaching a non-passive listener
  // on every zoom step would work and would also churn a DOM listener per frame
  // of a gesture.
  const zoomRef = useRef(zoomAbout);
  useEffect(() => {
    zoomRef.current = zoomAbout;
  });

  useEffect(() => {
    const element = canvasRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      // Without this the page scrolls out from under the zoom. It is also why
      // the listener can't be React's onWheel — see the note on this component.
      event.preventDefault();
      const box = element.getBoundingClientRect();
      zoomRef.current(
        event.clientX - box.left,
        event.clientY - box.top,
        Math.exp(-wheelPixels(event) * WHEEL_SENSITIVITY),
      );
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  const nameOf = (id: number) => championById.get(id)?.name ?? `#${id}`;

  // What the focused champion touches: its own rows, and every champion in them.
  const focus = useMemo(() => {
    if (active === null) return null;
    const rows = comps.filter((comp) => comp.champion_ids.includes(active));
    return {
      rows,
      compIds: new Set(rows.map((comp) => comp.id)),
      champions: new Set(rows.flatMap((comp) => comp.champion_ids)),
    };
  }, [active, comps]);

  const lit = (compId: string) => !focus || focus.compIds.has(compId);
  const litChampion = (id: number) => !focus || focus.champions.has(id);

  // Every drawable region, with its path built once: the fill layer and the
  // outline layer both walk this, and a hull that came back with fewer than
  // three points has nothing to fill.
  const regions = useMemo(
    () =>
      graph.groups.flatMap(({ comp, members }) => {
        const hull = layout.hulls.get(comp.id);
        if (!hull || hull.length < 3) return [];
        return [{ comp, members, d: polygonPath(hull), on: !focus || focus.compIds.has(comp.id) }];
      }),
    [graph, layout, focus],
  );

  /**
   * Bring a champion into view when it is tabbed to.
   *
   * At the opening scale the whole graph fits, so this never fires. Once
   * somebody has zoomed in, keyboard focus can land on a node several screens
   * away and light up nothing anyone can see — a dead end rather than a
   * degraded experience.
   */
  function revealChampion(id: number) {
    const point = layout.positions.get(id);
    if (!point) return;
    const px = point.x * view.k + view.x;
    const py = point.y * view.k + view.y;
    const margin = 48;
    if (px >= margin && py >= margin && px <= size.w - margin && py <= size.h - margin) return;
    setPanned({
      layout,
      t: { k: view.k, x: size.w / 2 - point.x * view.k, y: size.h / 2 - point.y * view.k },
    });
  }

  const summary =
    `${graph.degree.size} champions across ${comps.length} saved ` +
    `${comps.length === 1 ? "synergy" : "synergies"}, in ` +
    `${graph.clusters.length} unconnected ${graph.clusters.length === 1 ? "cluster" : "clusters"}.`;

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-start">
      <aside className="flex shrink-0 flex-col gap-3 lg:w-60">
        {controls}

        {/* Not optional decoration: a line and a tinted region mean two
            genuinely different things here, and a reader who assumes the region
            is "three pairs" has been misinformed by the picture. */}
        <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-[11px] text-grey-mid">
          <span className="flex items-center gap-1.5">
            <svg width="18" height="8" aria-hidden className="shrink-0">
              <line x1="1" y1="4" x2="17" y2="4" stroke={INK.edge} strokeWidth="2" />
            </svg>
            saved pair
          </span>
          <span className="flex items-start gap-1.5">
            <svg width="18" height="12" aria-hidden className="mt-0.5 shrink-0">
              <rect
                x="1"
                y="1"
                width="16"
                height="10"
                rx="2"
                fill={INK.group}
                fillOpacity={GROUP_FILL}
                stroke={INK.group}
                strokeOpacity={GROUP_STROKE}
              />
            </svg>
            <span>
              one saved synergy of 3–4,{" "}
              <span className="text-grey-light">not three pairs</span>
            </span>
          </span>
          <span>a number on a portrait = how many synergies it is in</span>
        </div>

        <div className="flex items-center gap-1 border-t border-border pt-3">
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => zoomAbout(size.w / 2, size.h / 2, BUTTON_ZOOM)}
            aria-label="Zoom in"
          >
            <ZoomIn />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => zoomAbout(size.w / 2, size.h / 2, 1 / BUTTON_ZOOM)}
            aria-label="Zoom out"
          >
            <ZoomOut />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            variant="outline"
            onClick={() => setPanned(null)}
            aria-label="Fit the whole graph"
            title="Fit the whole graph"
          >
            <Maximize />
          </Button>
          <span className="ml-1 text-[11px] tabular-nums text-grey-mid">
            {Math.round(view.k * 100)}%
          </span>
        </div>

        {/* A readout rather than only a highlight: the graph answers "what is
            this champion in" by lighting things up, which is unreadable to
            anyone not looking at it, and hard to read anyway once a hub has six
            partners spread across a cluster. Naming them costs a few lines. */}
        <div className="flex flex-col gap-1.5 border-t border-border pt-3 text-xs">
          {focus && active !== null ? (
            <>
              <p className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium text-white">{nameOf(active)}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-grey-mid">
                  {focus.rows.length}
                </span>
              </p>
              {focus.rows.map((comp) => (
                <span
                  key={comp.id}
                  className="rounded-sm border border-border bg-bg-tertiary px-1.5 py-0.5 text-[11px] text-grey-light"
                >
                  {comp.champion_ids
                    .filter((id) => id !== active)
                    .map(nameOf)
                    .join(" + ")}
                  {comp.label && <span className="ml-1 text-grey-mid">· {comp.label}</span>}
                </span>
              ))}
              {pinned !== null && (
                <button
                  type="button"
                  onClick={() => setPinned(null)}
                  className="self-start text-[11px] text-gold underline-offset-2 hover:underline"
                >
                  unpin
                </button>
              )}
            </>
          ) : (
            <p className="text-grey-mid">
              Hover a champion to trace its synergies. Scroll to zoom, drag to pan.
            </p>
          )}
        </div>

        <p className="border-t border-border pt-3 text-[11px] text-grey-mid">{summary}</p>
      </aside>

      <div
        ref={canvasRef}
        className="panel-hex relative h-[clamp(32rem,78vh,56rem)] min-w-0 flex-1 overflow-hidden p-0"
      >
        <svg
          width="100%"
          height="100%"
          role="img"
          aria-label={`Saved synergies as a graph. ${summary}`}
          className={cn("block", dragging ? "cursor-grabbing" : "cursor-grab")}
          // pan-y rather than none: a phone still scrolls the page vertically
          // past a canvas that fills most of it, which `none` would trap, while
          // a horizontal drag still pans. The mouse, which is what this view is
          // really for, is unaffected either way.
          style={{ touchAction: "pan-y" }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            draggedRef.current = false;
            dragRef.current = { x: e.clientX, y: e.clientY, from: view };
            setDragging(true);
            // Throws NotFoundError if the pointer is no longer active — which a
            // drag that ended outside the window can produce, and which would
            // otherwise take the whole handler down with it.
            try {
              e.currentTarget.setPointerCapture(e.pointerId);
            } catch {
              /* capture is an optimisation; the drag still tracks without it */
            }
          }}
          onPointerMove={(e) => {
            const start = dragRef.current;
            if (!start) return;
            const dx = e.clientX - start.x;
            const dy = e.clientY - start.y;
            if (!draggedRef.current && Math.hypot(dx, dy) < DRAG_SLOP) return;
            draggedRef.current = true;
            setPanned({
              layout,
              t: { k: start.from.k, x: start.from.x + dx, y: start.from.y + dy },
            });
          }}
          onPointerUp={(e) => {
            dragRef.current = null;
            setDragging(false);
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onPointerCancel={() => {
            dragRef.current = null;
            setDragging(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") setPinned(null);
          }}
        >
          <g transform={`translate(${view.x.toFixed(2)},${view.y.toFixed(2)}) scale(${view.k.toFixed(4)})`}>
            {/* Regions first, under everything — a group is the ground its
                champions stand on, not an annotation over them. Two passes, so
                the focused ones are painted over the faded ones rather than
                interleaved with them; each pass flattens its own fills and
                outlines. See `GROUP_FILL`. */}
            {([false, true] as const).map((on) => {
              const shapes = regions.filter((region) => region.on === on);
              if (shapes.length === 0) return null;

              return (
                <g key={String(on)} opacity={on ? 1 : DIMMED}>
                  <g opacity={GROUP_FILL}>
                    {shapes.map(({ comp, members, d }) => (
                      <path key={comp.id} d={d} fill={INK.group}>
                        <title>{`${members.map(nameOf).join(" + ")} — one saved synergy`}</title>
                      </path>
                    ))}
                  </g>
                  <g
                    opacity={on && focus ? GROUP_STROKE_FOCUS : groupStrokeOpacity(regions.length)}
                    pointerEvents="none"
                  >
                    {shapes.map(({ comp, d }) => (
                      <path key={comp.id} d={d} fill="none" stroke={INK.group} strokeWidth={1} />
                    ))}
                  </g>
                </g>
              );
            })}

            {graph.edges.map(({ comp, a, b }) => {
              const pa = layout.positions.get(a);
              const pb = layout.positions.get(b);
              if (!pa || !pb) return null;
              // Trimmed to the portraits' edges so a line never runs under a face.
              const dx = pb.x - pa.x;
              const dy = pb.y - pa.y;
              const dist = Math.hypot(dx, dy) || 1;
              const trim = NODE_RADIUS + 2;
              const on = lit(comp.id);

              return (
                <line
                  key={comp.id}
                  x1={pa.x + (dx / dist) * trim}
                  y1={pa.y + (dy / dist) * trim}
                  x2={pb.x - (dx / dist) * trim}
                  y2={pb.y - (dy / dist) * trim}
                  stroke={on && focus ? CHART_INK.primary : INK.edge}
                  strokeOpacity={on ? 1 : DIMMED}
                  strokeWidth={on && focus ? 2.5 : 1.75}
                  strokeLinecap="round"
                >
                  <title>{`${nameOf(a)} + ${nameOf(b)}`}</title>
                </line>
              );
            })}

            {[...layout.positions].map(([id, point]) => {
              const champion = championById.get(id);
              const degree = graph.degree.get(id) ?? 1;
              const r = NODE_RADIUS;
              const on = litChampion(id);
              const isActive = id === active;
              const label = `${nameOf(id)} — in ${degree} saved ${degree === 1 ? "synergy" : "synergies"}`;

              return (
                <g
                  key={id}
                  transform={`translate(${point.x.toFixed(1)},${point.y.toFixed(1)})`}
                  opacity={on ? 1 : DIMMED}
                  tabIndex={0}
                  role="button"
                  aria-label={label}
                  aria-pressed={pinned === id}
                  onMouseEnter={() => setHovered(id)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => {
                    setHovered(id);
                    revealChampion(id);
                  }}
                  onBlur={() => setHovered(null)}
                  onClick={() => {
                    // The pointer just panned the map; the mouseup that ended it
                    // is not also a click on whatever was under the cursor.
                    if (draggedRef.current) return;
                    setPinned((current) => (current === id ? null : id));
                  }}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter" && e.key !== " ") return;
                    e.preventDefault();
                    setPinned((current) => (current === id ? null : id));
                  }}
                  className="cursor-pointer outline-none"
                >
                  <title>{label}</title>

                  {champion ? (
                    // An SVG <image>, so next/image has nothing to offer here.
                    // crossOrigin is not load-bearing the way it is on
                    // ChampionAvatar — nothing exports this view to a PNG — but it
                    // keeps these sharing DDragon's cache entries with every other
                    // portrait in the app rather than fetching a second copy.
                    <image
                      href={championIconUrlById(champion.ddragonId, version)}
                      crossOrigin="anonymous"
                      x={-r}
                      y={-r}
                      width={r * 2}
                      height={r * 2}
                      preserveAspectRatio="xMidYMid slice"
                      style={{ clipPath: `inset(0 round ${NODE_CORNER}px)` }}
                    />
                  ) : (
                    // A champion Riot has since removed still has rows here. Same
                    // call as CompCard: a placeholder beats dropping it and making
                    // the synergy look like it has one member.
                    <>
                      <rect
                        x={-r}
                        y={-r}
                        width={r * 2}
                        height={r * 2}
                        rx={NODE_CORNER}
                        fill={INK.plate}
                      />
                      <text y={4} textAnchor="middle" fontSize={12} fill={CHART_INK.axis}>
                        ?
                      </text>
                    </>
                  )}

                  <rect
                    x={-r}
                    y={-r}
                    width={r * 2}
                    height={r * 2}
                    rx={NODE_CORNER}
                    fill="none"
                    stroke={isActive ? CHART_INK.primaryBright : INK.ring}
                    strokeWidth={isActive ? 2.5 : 1.25}
                  />

                  {/* Only for the hubs, and now the only thing that says a
                      champion is in several of these: the portraits are all one
                      size, and the name that used to sit under them collided
                      with everything around it. The rest is the tooltip and the
                      readout in the rail. */}
                  {degree >= BADGE_DEGREE && (
                    <>
                      <circle cx={r - 2} cy={-r + 2} r={7.5} fill={INK.surface} stroke={INK.ring} />
                      <text
                        x={r - 2}
                        y={-r + 5.5}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight={600}
                        fill={CHART_INK.primary}
                        style={{ pointerEvents: "none" }}
                      >
                        {degree}
                      </text>
                    </>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}

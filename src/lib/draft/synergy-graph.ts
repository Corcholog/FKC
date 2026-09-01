// The saved synergies as a graph, and the layout that draws one.
//
// Pure on the same terms as lib/draft/board.ts and lib/draft/context.ts: no
// React, no Supabase, nothing async, nothing the caller passed in is mutated.
//
// ## A synergy is a hyperedge, and drawing it as a clique would be a lie
//
// A two-champion synergy is an edge and draws as a line. A three- or
// four-champion synergy is **one saved row about all of them at once**, and the
// obvious rendering — a line between each pair — is wrong in a way nobody would
// ever catch: `{Skarner, Syndra, Viktor}` drawn as a triangle is pixel-identical
// to three separately saved pairs, and this pool already contains both shapes
// inside the same cluster. Someone would read "Skarner + Syndra is a saved
// synergy" straight off the screen and it isn't one.
//
// So the two shapes never share a rendering. `edges` holds pairs only, `groups`
// holds everything larger, and the view draws a group as a single enclosing
// region rather than as lines. That split is the whole reason this file exists
// instead of the view calling `champion_ids.flatMap(pairs)` inline — it is the
// one mistake here that would be confidently wrong rather than obviously empty,
// which is the same standard the contextual panel holds itself to.
//
// ## Clustering asks a different question from drawing
//
// `clusters` is connected components over **co-membership** — every pair inside
// every row, groups included. "Is Skarner related to Viktor at all" is a
// genuine yes; it is only "is there a saved pair Skarner + Viktor" that is a no.
// Two questions, two structures, and conflating them is exactly the bug above.

import type { DraftCompRow } from "@/lib/draft/types";

export type Point = { x: number; y: number };

/** A two-champion synergy. One saved row, one line. */
export type SynergyEdge = { comp: DraftCompRow; a: number; b: number };

/** A three- or four-champion synergy. One saved row, one enclosing region. */
export type SynergyGroup = { comp: DraftCompRow; members: number[] };

export type SynergyGraph = {
  /** championId → how many saved synergies contain it. */
  degree: Map<number, number>;
  edges: SynergyEdge[];
  groups: SynergyGroup[];
  /** Connected components over co-membership, biggest first. */
  clusters: number[][];
};

function bucket(map: Map<number, Set<number>>, id: number): Set<number> {
  let set = map.get(id);
  if (!set) {
    set = new Set();
    map.set(id, set);
  }
  return set;
}

/**
 * Pull the drawable structure out of a set of saved rows.
 *
 * Takes whatever it is given and reads `champion_ids`, so a caller that hands it
 * comps gets a graph of comps. `/prep/synergies` hands it synergies.
 *
 * Champion ids are deduped per row before anything else. The validator already
 * rejects a repeated champion (see phase-3's note — the check constraint can't
 * express it), but a duplicate that slipped in some other way would otherwise
 * become a zero-length self-edge, which draws as a stray dot with no explanation.
 */
export function buildSynergyGraph(comps: DraftCompRow[]): SynergyGraph {
  const degree = new Map<number, number>();
  const edges: SynergyEdge[] = [];
  const groups: SynergyGroup[] = [];
  const coMembers = new Map<number, Set<number>>();

  for (const comp of comps) {
    const members = [...new Set(comp.champion_ids)];
    if (members.length < 2) continue;

    for (const id of members) {
      degree.set(id, (degree.get(id) ?? 0) + 1);
      bucket(coMembers, id);
    }
    // Co-membership, for clustering only — never for drawing. See the header.
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        bucket(coMembers, members[i]).add(members[j]);
        bucket(coMembers, members[j]).add(members[i]);
      }
    }

    if (members.length === 2) edges.push({ comp, a: members[0], b: members[1] });
    else groups.push({ comp, members });
  }

  // Ids sorted before the walk so the component order — and therefore the
  // packed layout — is a function of the data rather than of row order.
  const seen = new Set<number>();
  const clusters: number[][] = [];
  for (const id of [...coMembers.keys()].sort((a, b) => a - b)) {
    if (seen.has(id)) continue;
    const stack = [id];
    const cluster: number[] = [];
    seen.add(id);
    while (stack.length > 0) {
      const current = stack.pop() as number;
      cluster.push(current);
      for (const next of coMembers.get(current) ?? []) {
        if (seen.has(next)) continue;
        seen.add(next);
        stack.push(next);
      }
    }
    clusters.push(cluster.sort((a, b) => a - b));
  }
  clusters.sort((a, b) => b.length - a.length || a[0] - b[0]);

  return { degree, edges, groups, clusters };
}

// ------------------------------------------------------------
// Containment
// ------------------------------------------------------------

export type CompRelations = {
  /** Saved rows this one fully contains — the smaller combos inside it. */
  contains: DraftCompRow[];
  /** Saved rows that fully contain this one — where it extends to. */
  containedBy: DraftCompRow[];
};

/**
 * Which saved rows sit inside which others.
 *
 * `{Wukong, Orianna}` and `{Gnar, Wukong, Orianna}` are two rows in the list
 * with nothing linking them, and the second is the first plus a champion. That
 * relation is invisible on a wall of cards and is the thing you actually want to
 * know while looking at either one.
 *
 * Named after `CounterIndex`'s `counters` / `counteredBy` on purpose — same
 * "both readings of one relation, built once" shape, same reason.
 *
 * **Proper containment only.** Equal sets are excluded, so a duplicated row
 * doesn't claim to extend itself. Cross-kind is possible in principle (a
 * two-champion synergy sits inside plenty of five-champion comps) and never
 * happens in practice, because `loadDraftComps` filters by kind and each list
 * page passes one kind's rows — on `/prep/comps` every row is size 5, so
 * nothing properly contains anything and the map comes back empty.
 *
 * O(n²) subset checks over rows of at most five ids. At a few hundred saved rows
 * that is tens of thousands of `Set.has` calls, once per render of a page that
 * already renders a portrait per champion.
 */
export function relateComps(comps: DraftCompRow[]): Map<string, CompRelations> {
  const sets = comps.map((comp) => new Set(comp.champion_ids));
  const relations = new Map<string, CompRelations>();
  for (const comp of comps) relations.set(comp.id, { contains: [], containedBy: [] });

  for (let i = 0; i < comps.length; i++) {
    for (let j = 0; j < comps.length; j++) {
      if (i === j) continue;
      if (sets[i].size >= sets[j].size) continue; // proper subsets only
      let inside = true;
      for (const id of sets[i]) {
        if (!sets[j].has(id)) {
          inside = false;
          break;
        }
      }
      if (!inside) continue;
      relations.get(comps[i].id)?.containedBy.push(comps[j]);
      relations.get(comps[j].id)?.contains.push(comps[i]);
    }
  }
  return relations;
}

/** The champions `bigger` adds on top of `smaller`, in `bigger`'s stored order. */
export function extraChampions(smaller: DraftCompRow, bigger: DraftCompRow): number[] {
  const inner = new Set(smaller.champion_ids);
  return bigger.champion_ids.filter((id) => !inner.has(id));
}

// ------------------------------------------------------------
// Layout
// ------------------------------------------------------------

/** Portrait radius at degree 1, and at `HUB_DEGREE` or above. */
const NODE_MIN_R = 17;
const NODE_MAX_R = 26;
const HUB_DEGREE = 6;

/** Clear space around a portrait — enough for the name label under it. */
const NODE_GAP = 20;

const EDGE_LENGTH = 118;
/** How far a group's members settle from its centroid. */
const GROUP_LENGTH = 60;
/** Clear space between a group's region and the portraits it encloses. */
const HULL_PAD = 14;

const REPULSION = 7000;
const EDGE_STIFFNESS = 0.055;
const GROUP_STIFFNESS = 0.14;
const ITERATIONS = 460;
const START_TEMP = 46;

/** Gap between two clusters, and the margin around the whole drawing. */
const CLUSTER_GAP = 44;
const MARGIN = 34;

/**
 * Width-to-height the packer aims the whole drawing at.
 *
 * The canvas it lands on is a wide box, and the fit scale is whichever of the
 * two axes runs out first — so a drawing that comes out square is letterboxed
 * and opens at half the scale it could have. Packing toward roughly 2:1 spends
 * the width that is actually there.
 *
 * A constant rather than the canvas's real aspect, which the view knows and
 * this function could be told: threading it through would relayout the graph on
 * every window resize, and a layout that reshuffles when you drag the window
 * edge is worse than one that is occasionally a little tall.
 */
const PACK_ASPECT = 1.9;

/**
 * A hub is drawn bigger, because "this champion is in six of these" is the
 * single fact the card list cannot show and the one this view exists for.
 * Exported so the layout and the view can't disagree about how much room a
 * portrait takes.
 */
export function nodeRadius(degree: number): number {
  const t = Math.min(degree, HUB_DEGREE) / HUB_DEGREE;
  return NODE_MIN_R + (NODE_MAX_R - NODE_MIN_R) * t;
}

/**
 * How far a group's region sits outside the portraits it encloses.
 *
 * Shared with the view, which needs it for the one group shape the layout can't
 * express as a polygon — see the capsule branch in `SynergyGraphView`.
 */
export function groupPadding(memberRadii: number[]): number {
  return Math.max(...memberRadii, NODE_MIN_R) + HULL_PAD;
}

export type SynergyLayout = {
  width: number;
  height: number;
  positions: Map<number, Point>;
  /** comp.id → the polygon enclosing that group's members, already padded. */
  hulls: Map<string, Point[]>;
};

/** Deterministic PRNG. Same pool, same picture, every render. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One connected cluster, force-laid-out in its own local space.
 *
 * **Per cluster, not over the whole graph, and that isn't an optimisation.** A
 * plain force simulation has no answer for disconnected components: with no
 * centering force they drift apart forever, and with one they pile into the
 * middle and read as a single tangle. Laying each out alone and packing the
 * boxes afterwards is what makes "these four champions have nothing to do with
 * the other sixteen" visible, which is most of the point of drawing this at all.
 *
 * **It runs to completion synchronously and the result is a static picture.**
 * No animation loop, no requestAnimationFrame, no state churn. The biggest
 * cluster in a realistic pool is a few dozen champions, and a few dozen squared
 * times `ITERATIONS` is a number of floating-point operations a browser gets
 * through before it has finished laying out the toolbar above the graph. The
 * seeded start is what makes it reproducible: filtering the list re-runs this,
 * and a layout that reshuffled every keystroke would be unreadable.
 */
function layoutCluster(
  ids: number[],
  edges: SynergyEdge[],
  groups: SynergyGroup[],
  radiusOf: (id: number) => number,
): { positions: Map<number, Point>; width: number; height: number } {
  const index = new Map(ids.map((id, i) => [id, i]));
  const radii = ids.map(radiusOf);
  const n = ids.length;

  // Seeded on the cluster's own membership, so it keeps its shape when another
  // cluster elsewhere in the pool gains or loses a champion.
  const random = mulberry32(ids.reduce((acc, id) => (acc * 31 + id) >>> 0, 17));

  // A golden-angle spiral rather than pure noise: it starts the simulation
  // spread out and untangled, which is worth a hundred iterations of settling.
  // The jitter only breaks exact symmetries, which a noiseless start can sit in
  // forever (three mutually repelling nodes at the same radius never separate).
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  const spread = EDGE_LENGTH * 0.5 * Math.sqrt(Math.max(n, 1));
  for (let i = 0; i < n; i++) {
    const angle = i * 2.399963229728653;
    const r = spread * Math.sqrt((i + 0.5) / n);
    px[i] = Math.cos(angle) * r + (random() - 0.5) * 6;
    py[i] = Math.sin(angle) * r + (random() - 0.5) * 6;
  }

  const localEdges = edges
    .filter((e) => index.has(e.a) && index.has(e.b))
    .map((e) => [index.get(e.a) as number, index.get(e.b) as number] as const);
  const localGroups = groups
    .filter((g) => g.members.every((id) => index.has(id)))
    .map((g) => g.members.map((id) => index.get(id) as number));

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);

  for (let step = 0; step < ITERATIONS; step++) {
    dx.fill(0);
    dy.fill(0);

    // Repulsion, every pair.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = px[i] - px[j];
        let vy = py[i] - py[j];
        let dist = Math.hypot(vx, vy);
        if (dist < 0.01) {
          vx = (random() - 0.5) || 0.5;
          vy = (random() - 0.5) || 0.5;
          dist = Math.hypot(vx, vy);
        }
        const force = REPULSION / (dist * dist);
        const ux = (vx / dist) * force;
        const uy = (vy / dist) * force;
        dx[i] += ux;
        dy[i] += uy;
        dx[j] -= ux;
        dy[j] -= uy;
      }
    }

    // Springs along saved pairs.
    for (const [a, b] of localEdges) {
      const vx = px[b] - px[a];
      const vy = py[b] - py[a];
      const dist = Math.max(Math.hypot(vx, vy), 0.01);
      const force = (dist - EDGE_LENGTH) * EDGE_STIFFNESS;
      const ux = (vx / dist) * force;
      const uy = (vy / dist) * force;
      dx[a] += ux;
      dy[a] += uy;
      dx[b] -= ux;
      dy[b] -= uy;
    }

    // Groups pull toward their own centroid rather than toward each other —
    // a hyperedge has no pairwise structure to model, and giving it one here
    // would put back the clique the header rules out.
    for (const members of localGroups) {
      let cx = 0;
      let cy = 0;
      for (const m of members) {
        cx += px[m];
        cy += py[m];
      }
      cx /= members.length;
      cy /= members.length;

      for (const m of members) {
        const vx = cx - px[m];
        const vy = cy - py[m];
        const dist = Math.max(Math.hypot(vx, vy), 0.01);
        const force = (dist - GROUP_LENGTH) * GROUP_STIFFNESS;
        dx[m] += (vx / dist) * force;
        dy[m] += (vy / dist) * force;
      }

      // And push everyone *else* clear of the region the group will occupy.
      // Without this a champion can drift inside a hull it isn't a member of,
      // and a hull is read as "these champions, together" — the reader has no
      // way to tell the intruder apart from a member. Cheap insurance against
      // the one misreading this rendering can still produce.
      let reach = 0;
      for (const m of members) reach = Math.max(reach, Math.hypot(px[m] - cx, py[m] - cy));
      const keepOut = reach + HULL_PAD + NODE_MAX_R;
      const inside = new Set(members);
      for (let i = 0; i < n; i++) {
        if (inside.has(i)) continue;
        const vx = px[i] - cx;
        const vy = py[i] - cy;
        const dist = Math.max(Math.hypot(vx, vy), 0.01);
        if (dist >= keepOut) continue;
        const force = (keepOut - dist) * 0.5;
        dx[i] += (vx / dist) * force;
        dy[i] += (vy / dist) * force;
      }
    }

    // Cool down, so early steps untangle and late ones only settle.
    const temp = START_TEMP * (1 - step / ITERATIONS) + 0.5;
    for (let i = 0; i < n; i++) {
      const dist = Math.hypot(dx[i], dy[i]);
      if (dist < 1e-6) continue;
      const capped = Math.min(dist, temp);
      px[i] += (dx[i] / dist) * capped;
      py[i] += (dy[i] / dist) * capped;
    }

    // Hard separation last, so nothing the forces did can leave two portraits
    // overlapping. Portraits that overlap don't read as a dense cluster, they
    // read as a rendering bug.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const minimum = radii[i] + radii[j] + NODE_GAP;
        const vx = px[j] - px[i];
        const vy = py[j] - py[i];
        const dist = Math.hypot(vx, vy);
        if (dist >= minimum || dist < 1e-6) continue;
        const shift = (minimum - dist) / 2;
        const ux = (vx / dist) * shift;
        const uy = (vy / dist) * shift;
        px[i] -= ux;
        py[i] -= uy;
        px[j] += ux;
        py[j] += uy;
      }
    }
  }

  // Normalise into a box whose origin is the top-left of the ink, portraits
  // included — the packer works in whole boxes and can't know about radii.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, px[i] - radii[i]);
    minY = Math.min(minY, py[i] - radii[i]);
    maxX = Math.max(maxX, px[i] + radii[i]);
    maxY = Math.max(maxY, py[i] + radii[i]);
  }

  const positions = new Map<number, Point>();
  for (let i = 0; i < n; i++) {
    positions.set(ids[i], { x: px[i] - minX, y: py[i] - minY });
  }
  return { positions, width: maxX - minX, height: maxY - minY };
}

/** Andrew's monotone chain. Returns the hull in order, without a repeated first point. */
function convexHull(points: Point[]): Point[] {
  if (points.length < 3) return points;
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Point, a: Point, b: Point) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const half = (source: Point[]) => {
    const out: Point[] = [];
    for (const p of source) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };

  return [...half(sorted), ...half([...sorted].reverse())];
}

/** How finely a corner arc is subdivided. ~23° per segment reads as smooth. */
const CORNER_STEP = 0.4;

/**
 * Grow a convex hull outward by `pad` — the region within `pad` of the shape,
 * which is straight offset edges joined by circular arcs at the corners.
 *
 * **Mitering the corners instead is the obvious version and it is wrong.** The
 * bisector reach is `pad / cos(half-angle)`, which runs away as a corner gets
 * sharp — and a three-champion group laid out in a near-straight line is two
 * very sharp corners. On real data that drew a hundred-pixel cyan spike shooting
 * off across the graph, which reads as anything except "these three champions".
 * Clamping the miter trades the spike for a chisel; rounding has no bad case.
 *
 * Rounding also folds in the degenerate shapes for free. Three collinear
 * champions leave a hull that is a bare segment, and its rounded offset is a
 * capsule — so the caller gets a fillable ring back whatever the hull was, and
 * no branch has to know the difference.
 *
 * Winding-agnostic on purpose: each corner interpolates between the two edge
 * normals the short way round, so there is no clockwise-versus-counterclockwise
 * to get backwards, and no SVG sweep flag to reason about.
 */
function roundedOffset(points: Point[], pad: number): Point[] {
  const n = points.length;
  const centroid = points.reduce(
    (acc, p) => ({ x: acc.x + p.x / n, y: acc.y + p.y / n }),
    { x: 0, y: 0 },
  );

  // The edge normal, flipped if it aims at the centroid. For a two-point hull
  // the midpoint *is* the centroid and neither side is "outward" — the test
  // then leaves the two normals opposed, which is what turns the two corners
  // into the two ends of a capsule.
  const outward = (a: Point, b: Point): Point => {
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const len = Math.hypot(vx, vy) || 1;
    let nx = -vy / len;
    let ny = vx / len;
    if (((a.x + b.x) / 2 - centroid.x) * nx + ((a.y + b.y) / 2 - centroid.y) * ny < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { x: nx, y: ny };
  };

  const ring: Point[] = [];
  for (let i = 0; i < n; i++) {
    const current = points[i];
    const before = outward(points[(i - 1 + n) % n], current);
    const after = outward(current, points[(i + 1) % n]);

    const from = Math.atan2(before.y, before.x);
    let sweep = Math.atan2(after.y, after.x) - from;
    while (sweep > Math.PI) sweep -= 2 * Math.PI;
    while (sweep < -Math.PI) sweep += 2 * Math.PI;

    const steps = Math.max(2, Math.ceil(Math.abs(sweep) / CORNER_STEP));
    for (let s = 0; s <= steps; s++) {
      const angle = from + (sweep * s) / steps;
      ring.push({ x: current.x + Math.cos(angle) * pad, y: current.y + Math.sin(angle) * pad });
    }
  }
  return ring;
}

/**
 * Positions for every champion and a polygon for every group.
 *
 * Clusters are laid out independently and then shelf-packed left to right,
 * biggest first — that is the one someone came to look at. The shelf width is
 * derived from how much there is to pack rather than fixed, so two synergies and
 * two hundred both come out at roughly `PACK_ASPECT`. The returned
 * `width`/`height` are the viewBox.
 */
export function layoutSynergyGraph(graph: SynergyGraph): SynergyLayout {
  const radiusOf = (id: number) => nodeRadius(graph.degree.get(id) ?? 1);
  const positions = new Map<number, Point>();

  // Lay every cluster out first: the shelf width is a function of the total
  // area, which isn't known until they all have one.
  const laidOut = graph.clusters.map((ids) =>
    layoutCluster(ids, graph.edges, graph.groups, radiusOf),
  );
  const area = laidOut.reduce(
    (total, laid) => total + (laid.width + CLUSTER_GAP) * (laid.height + CLUSTER_GAP),
    0,
  );
  // Never narrower than the widest cluster, which cannot be broken up.
  const shelfWidth = Math.max(
    Math.sqrt(area * PACK_ASPECT),
    ...laidOut.map((laid) => laid.width),
  );

  let shelfX = MARGIN;
  let shelfY = MARGIN;
  let shelfHeight = 0;
  let width = 0;

  for (const laid of laidOut) {
    if (shelfX > MARGIN && shelfX + laid.width > shelfWidth + MARGIN) {
      shelfX = MARGIN;
      shelfY += shelfHeight + CLUSTER_GAP;
      shelfHeight = 0;
    }

    for (const [id, point] of laid.positions) {
      positions.set(id, { x: point.x + shelfX, y: point.y + shelfY });
    }

    shelfX += laid.width + CLUSTER_GAP;
    shelfHeight = Math.max(shelfHeight, laid.height);
    width = Math.max(width, shelfX - CLUSTER_GAP);
  }

  const hulls = new Map<string, Point[]>();
  for (const group of graph.groups) {
    const points = group.members
      .map((id) => positions.get(id))
      .filter((p): p is Point => p !== undefined);
    if (points.length < 2) continue;
    // Always a closed, fillable ring — a hull that came back as a bare segment
    // rounds into a capsule rather than needing a second rendering. See
    // `roundedOffset`.
    hulls.set(group.comp.id, roundedOffset(convexHull(points), groupPadding(group.members.map(radiusOf))));
  }

  // Re-measure with the hulls in, then shift the whole drawing so the margin
  // holds on every side. A hull reaches past the portrait box it was measured
  // from — by the padding, and by more at a sharp miter — so a group on the left
  // or top edge of a cluster would otherwise be clipped by the viewBox.
  let minX = 0;
  let minY = 0;
  let maxX = width;
  let maxY = shelfY + shelfHeight;
  for (const [id, point] of positions) {
    const r = radiusOf(id);
    minX = Math.min(minX, point.x - r);
    minY = Math.min(minY, point.y - r);
    maxX = Math.max(maxX, point.x + r);
    maxY = Math.max(maxY, point.y + r);
  }
  for (const hull of hulls.values()) {
    for (const point of hull) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  const shiftX = MARGIN - minX;
  const shiftY = MARGIN - minY;
  if (shiftX !== 0 || shiftY !== 0) {
    for (const [id, point] of positions) {
      positions.set(id, { x: point.x + shiftX, y: point.y + shiftY });
    }
    for (const [id, hull] of hulls) {
      hulls.set(
        id,
        hull.map((point) => ({ x: point.x + shiftX, y: point.y + shiftY })),
      );
    }
  }

  return {
    positions,
    hulls,
    width: Math.max(maxX + shiftX + MARGIN, 1),
    height: Math.max(maxY + shiftY + MARGIN, 1),
  };
}

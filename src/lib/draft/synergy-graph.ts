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

/**
 * Portrait radius — one size, whatever the champion is in.
 *
 * This used to scale with degree, so a hub was literally the biggest thing on
 * screen. It read well and it cost more than it was worth: a bigger portrait is
 * a bigger keep-out radius and a bigger region around every group it is in, and
 * the count badge already says the number outright. Uniform portraits also make
 * the whole layout one length scale, which is why the keep-out and the
 * separation below no longer carry a radius each.
 */
export const NODE_RADIUS = 24;

/**
 * Clear space around a portrait.
 *
 * It used to be wider below than beside, to hold the champion's name. The names
 * are gone — they collided with the portraits at any density worth drawing —
 * but "enough that two faces don't touch" turned out to be the wrong amount for
 * a different reason: the portraits are not the only thing drawn between two
 * portraits. A line runs from one to another and a region wraps three of them,
 * and when the faces are a few pixels apart both of those are hidden behind a
 * face they have nothing to do with. At ten pixels every saved pair crossed one
 * and a half unrelated portraits on its way and under two thirds of each group
 * region was covered up; at twenty it is one, and half the region shows.
 *
 * Sized against what the portrait has to do now that nothing is written next to
 * it: the icon is the only thing naming the champion, and at these two numbers
 * it lands between 45 and 48 pixels across at the opening scale, which is what
 * DDragon serves. Bigger portraits keep winning on paper right up until the
 * drawing stops fitting the canvas and the reader has to pan to find anything.
 */
const NODE_GAP = 20;

const EDGE_LENGTH = 118;
/** How far a group's members settle from its centroid. */
const GROUP_LENGTH = 30;
/**
 * Clear space between a group's region and the portraits it encloses — and so
 * the width of the tinted band that is all anyone can actually see of a region
 * whose members are surrounded by other portraits. Wider than it needs to be to
 * merely contain them, and no wider: past about this the regions grow enough to
 * start overlapping each other, which is its own kind of mess.
 */
const HULL_PAD = 12;

const REPULSION = 7000;
/**
 * Past this, two portraits stop pushing each other apart.
 *
 * An inverse-square force is weak far away and never zero, and in a cluster of
 * sixty champions the *sum* of fifty weak pushes is not weak — it inflates the
 * whole component until the springs, which only pull along saved pairs, balance
 * it. That is what made a big pool draw as short edges near the middle and
 * three-hundred-pixel ones at the rim. Cutting the tail off makes repulsion a
 * local anti-overlap force, which is the only job it has here: keeping the
 * component together is the springs' job, and keeping portraits off each other
 * is the hard separation pass at the end of every step.
 */
const REPULSION_RANGE = 250;
/** What is left of repulsion between two champions in the same saved synergy. */
const GROUP_REPULSION = 0.3;
/**
 * Stiff, deliberately. A slack spring lets everything else in here — the
 * repulsion of a crowd, a group hauling one member off toward its centroid —
 * decide how long a saved pair is drawn, and the pairs then come out at two and
 * three times their rest length with no relation to anything the reader can
 * see. Holding them near `EDGE_LENGTH` is also what unpicks crossings: over the
 * sizes measured here, four times the old stiffness roughly halves them.
 */
const EDGE_STIFFNESS = 0.22;
const GROUP_STIFFNESS = 0.14;
const ITERATIONS = 460;
const START_TEMP = 46;

/**
 * How hard a group shoves a champion that isn't in it out of its region, and
 * the furthest that shove can ever be from the edge of the region.
 *
 * **The cap is the whole point.** This force used to be uncapped and measured
 * from the group's centroid out to `reach + padding`, which is a quantity the
 * force itself inflates: shoving a stranger away spreads the groups *it*
 * belongs to, which widens their reach, which shoves harder. Two groups sharing
 * a champion were enough to start it, and a pool of forty-five synergies ran
 * away to a twenty-thousand-pixel canvas — the graph the user actually sees
 * then being a few specks and some enormous lines, drawn at whatever scale it
 * took to fit that on screen. Capped, the worst case is a stranger that stays
 * put and a saved pair drawn longer than it should be.
 */
const KEEPOUT_STIFFNESS = 0.45;
const KEEPOUT_MAX_PUSH = 34;

/**
 * A weak pull toward the cluster's own centre, stronger vertically than
 * horizontally.
 *
 * Two jobs, one force. It closes the holes a force layout leaves when a cluster
 * is mostly one hub's spokes, and the asymmetry is what aims the result wider:
 * the shelf packer can only spend the canvas's width when there are several
 * clusters to shelve, and a real pool is one big component and a handful of
 * pairs. Squeezing the big one vertically is the only thing that fills a wide
 * canvas with it.
 *
 * Kept far below `EDGE_STIFFNESS` on purpose — enough to shape a component over
 * hundreds of iterations, never enough to pull a champion through the middle of
 * one. `GRAVITY_SQUEEZE` is how much more of it the vertical axis gets. It is
 * deliberately not `PACK_ASPECT` and does not track it: gravity fights every
 * other force for the shape and lands well short of what it asks for, so 5 here
 * buys about 1.3, and asking for more starts stretching saved pairs instead.
 */
const GRAVITY = 0.04;
const GRAVITY_SQUEEZE = 5;

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

/** Points sampled around one portrait, when a group's region is traced. */
const HULL_SAMPLES = 16;

/**
 * A ring of points just outside one portrait, for the hull of a group to catch.
 *
 * Pushed out by `1 / cos(π / samples)` so the polygon *circumscribes* the circle
 * it stands for: sample the circle itself and the hull cuts a chord across every
 * arc, which at sixteen samples is a pixel of portrait poking out of its own
 * region on the diagonals.
 */
function portraitRing(centre: Point, radius: number): Point[] {
  const r = radius / Math.cos(Math.PI / HULL_SAMPLES);
  const ring: Point[] = [];
  for (let i = 0; i < HULL_SAMPLES; i++) {
    const angle = (i * 2 * Math.PI) / HULL_SAMPLES;
    ring.push({ x: centre.x + Math.cos(angle) * r, y: centre.y + Math.sin(angle) * r });
  }
  return ring;
}

/**
 * The degree at which a champion gets a count badge on its portrait.
 *
 * With every portrait the same size, this is the only thing left saying "in
 * more than a couple of these" — and it is worth its ink where the answer is
 * several, not on the long tail of ones. Exported so the view and this file
 * agree on which champions are hubs.
 */
export const BADGE_DEGREE = 3;

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
 * No animation loop, no requestAnimationFrame, no state churn. That is a real
 * budget, not a free one — the whole layout is about 100ms at forty-five saved
 * synergies and about half a second at two hundred and forty, on one main
 * thread, every time the toolbar filters. It is `ITERATIONS` passes over
 * everything-against-everything, so it grows with the square of the biggest
 * cluster; the squared-distance comparisons in the two `n²` passes and the
 * cheap disc test in front of the keep-out are what keep that number down, and
 * are worth leaving alone.
 *
 * The seeded start is what makes it reproducible: filtering the list re-runs
 * this, and a layout that reshuffled every keystroke would be unreadable.
 */
function layoutCluster(
  ids: number[],
  edges: SynergyEdge[],
  groups: SynergyGroup[],
): { positions: Map<number, Point>; width: number; height: number } {
  const index = new Map(ids.map((id, i) => [id, i]));
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

  // Who is in each group, worked out once rather than 460 times.
  const groupInfo = localGroups.map((members) => {
    const mask = new Uint8Array(n);
    for (const m of members) mask[m] = 1;
    return { members, mask };
  });

  // Pairs that share a saved synergy of three or four, so repulsion can hold
  // off between them. Full repulsion settles a trio about ninety pixels apart
  // — well clear of the hard separation floor — and the region drawn around
  // them is then mostly the gaps, which is the "big empty blob" this view kept
  // producing. They are drawn as one thing; they should sit like one thing, and
  // the separation pass below still guarantees no two portraits touch.
  const grouped = new Set<number>();
  for (const members of localGroups) {
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const [a, b] = members[i] < members[j] ? [members[i], members[j]] : [members[j], members[i]];
        grouped.add(a * n + b);
      }
    }
  }

  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  const nearest: Nearest = { x: 0, y: 0, distance: 0, inside: false };

  for (let step = 0; step < ITERATIONS; step++) {
    dx.fill(0);
    dy.fill(0);

    // Repulsion, every pair within range of each other. Squared distances in
    // the comparisons: this is the innermost loop in the file, and `Math.hypot`
    // costs several times a multiply-and-compare for a number thrown away on
    // most of the pairs it is asked about.
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let vx = px[i] - px[j];
        let vy = py[i] - py[j];
        let square = vx * vx + vy * vy;
        if (square > REPULSION_RANGE * REPULSION_RANGE) continue;
        if (square < 0.0001) {
          vx = (random() - 0.5) || 0.5;
          vy = (random() - 0.5) || 0.5;
          square = vx * vx + vy * vy;
        }
        const dist = Math.sqrt(square);
        const force = (REPULSION / (dist * dist)) * (grouped.has(i * n + j) ? GROUP_REPULSION : 1);
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
    for (const { members, mask } of groupInfo) {
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
      //
      // Measured against the polygon the members actually span, not a circle
      // around their centroid: three champions in a row occupy a thin sliver,
      // and reserving the disc that contains it is most of a cluster's area
      // spent on nothing. The push is capped — see `KEEPOUT_MAX_PUSH`.
      // The disc that contains the group, as a cheap first pass: at a realistic
      // pool size this is a hundred groups against a hundred champions on every
      // one of 460 steps, and all but a handful of those pairs are nowhere near
      // each other. Only what survives it pays for the polygon.
      let reach = 0;
      for (const m of members) reach = Math.max(reach, Math.hypot(px[m] - cx, py[m] - cy));
      // A stranger is clear when its own portrait misses the drawn region: the
      // region reaches HULL_PAD past a member portrait, and the stranger is a
      // portrait too.
      const clearance = 2 * NODE_RADIUS + HULL_PAD;
      const ignoreBeyond = reach + clearance;

      let shape: Point[] | null = null;
      for (let i = 0; i < n; i++) {
        if (mask[i] === 1) continue;
        const awayX = px[i] - cx;
        const awayY = py[i] - cy;
        if (awayX * awayX + awayY * awayY >= ignoreBeyond * ignoreBeyond) continue;
        shape ??= convexHull(members.map((m) => ({ x: px[m], y: py[m] })));
        const near = nearestOnShape(shape, px[i], py[i], nearest);
        const gap = near.inside ? -near.distance : near.distance;
        if (gap >= clearance) continue;
        // Straight out through the nearest edge. A point sitting exactly on the
        // shape has no such direction, so fall back to the centroid ray.
        let ux = px[i] - near.x;
        let uy = py[i] - near.y;
        let length = Math.hypot(ux, uy);
        if (length < 0.01) {
          ux = px[i] - cx || 0.5;
          uy = py[i] - cy || 0.5;
          length = Math.hypot(ux, uy);
        }
        if (near.inside) {
          ux = -ux;
          uy = -uy;
        }
        const force = Math.min(clearance - gap, KEEPOUT_MAX_PUSH) * KEEPOUT_STIFFNESS;
        dx[i] += (ux / length) * force;
        dy[i] += (uy / length) * force;
      }
    }

    // Gravity, last of the forces: weak, toward the cluster's own centre, and
    // squeezing harder on the axis the canvas has least of. See `GRAVITY`.
    let gx = 0;
    let gy = 0;
    for (let i = 0; i < n; i++) {
      gx += px[i];
      gy += py[i];
    }
    gx /= n;
    gy /= n;
    for (let i = 0; i < n; i++) {
      dx[i] += (gx - px[i]) * GRAVITY;
      dy[i] += (gy - py[i]) * GRAVITY * GRAVITY_SQUEEZE;
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
    const minimum = 2 * NODE_RADIUS + NODE_GAP;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const vx = px[j] - px[i];
        const vy = py[j] - py[i];
        const square = vx * vx + vy * vy;
        if (square >= minimum * minimum || square < 1e-12) continue;
        // Both move half of what it takes to get the pair apart.
        const dist = Math.sqrt(square);
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
  // included — the packer works in whole boxes and can't know about portraits.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, px[i] - NODE_RADIUS);
    minY = Math.min(minY, py[i] - NODE_RADIUS);
    maxX = Math.max(maxX, px[i] + NODE_RADIUS);
    maxY = Math.max(maxY, py[i] + NODE_RADIUS);
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

/**
 * The closest point on a convex shape's boundary, and which side of it we are on.
 *
 * `shape` is whatever `convexHull` returned, so it can be a polygon, a bare
 * segment (collinear members) or a single point (coincident ones) — all three
 * are the same walk over consecutive pairs, and only the polygon can have an
 * inside. Used by the keep-out force, which needs the direction out as well as
 * the distance.
 *
 * Writes into `out` instead of returning a fresh object, and compares squared
 * distances so that the one square root is taken at the end rather than per
 * edge. Both are here because of where this is called from: the innermost part
 * of the keep-out force, which on a dense pool asks this question a few million
 * times per layout, and a few million short-lived objects is the difference
 * between the graph redrawing while you type and visibly stopping to think.
 */
type Nearest = { x: number; y: number; distance: number; inside: boolean };

function nearestOnShape(shape: Point[], x: number, y: number, out: Nearest): Nearest {
  if (shape.length === 1) {
    out.x = shape[0].x;
    out.y = shape[0].y;
    out.distance = Math.sqrt((x - out.x) * (x - out.x) + (y - out.y) * (y - out.y));
    out.inside = false;
    return out;
  }

  let bestX = shape[0].x;
  let bestY = shape[0].y;
  let best = Infinity;
  // A two-point shape is one segment, walked once; a polygon closes the ring.
  const last = shape.length === 2 ? 1 : shape.length;
  for (let i = 0; i < last; i++) {
    const a = shape[i];
    const b = shape[i + 1 === shape.length ? 0 : i + 1];
    const vx = b.x - a.x;
    const vy = b.y - a.y;
    const lengthSquared = vx * vx + vy * vy;
    let t = lengthSquared < 1e-9 ? 0 : ((x - a.x) * vx + (y - a.y) * vy) / lengthSquared;
    if (t < 0) t = 0;
    else if (t > 1) t = 1;
    const cx = a.x + vx * t;
    const cy = a.y + vy * t;
    const square = (x - cx) * (x - cx) + (y - cy) * (y - cy);
    if (square >= best) continue;
    best = square;
    bestX = cx;
    bestY = cy;
  }

  let inside = false;
  if (shape.length >= 3) {
    for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
      if (
        shape[i].y > y !== shape[j].y > y &&
        x < ((shape[j].x - shape[i].x) * (y - shape[i].y)) / (shape[j].y - shape[i].y) + shape[i].x
      ) {
        inside = !inside;
      }
    }
  }

  out.x = bestX;
  out.y = bestY;
  out.distance = Math.sqrt(best);
  out.inside = inside;
  return out;
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
  const positions = new Map<number, Point>();

  // Lay every cluster out first: the shelf width is a function of the total
  // area, which isn't known until they all have one.
  const laidOut = graph.clusters.map((ids) =>
    layoutCluster(ids, graph.edges, graph.groups),
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

  // The hull of the members' *portraits*, not of their centres grown by a
  // padding. Two reasons, and the second is the one that shows.
  //
  // Growing a centre-hull outward means one padding for the whole shape, so
  // every corner is inflated by the biggest member's radius even where the
  // member is the smallest — and doing it by mitering the corners is worse
  // still: the bisector reach is `pad / cos(half-angle)`, which runs away as a
  // corner gets sharp, and three champions in a near-straight line are two very
  // sharp corners. That drew a hundred-pixel spike shooting off across the
  // graph, which reads as anything except "these three champions".
  //
  // Hulling the rings has no such case. Each portrait contributes its own
  // radius, the shape comes out closed and fillable whatever the members did —
  // three collinear champions give a capsule, coincident ones a disc — and it is
  // the tightest region that still contains every portrait it claims.
  const hulls = new Map<string, Point[]>();
  for (const group of graph.groups) {
    const ring: Point[] = [];
    for (const id of group.members) {
      const point = positions.get(id);
      if (point) ring.push(...portraitRing(point, NODE_RADIUS + HULL_PAD));
    }
    if (ring.length === 0) continue;
    hulls.set(group.comp.id, convexHull(ring));
  }

  // Re-measure with the hulls in, then shift the whole drawing so the margin
  // holds on every side. A hull reaches past the portrait box it was measured
  // from, by `HULL_PAD`, so a group on the left or top edge of a cluster would
  // otherwise be clipped by the viewBox.
  let minX = 0;
  let minY = 0;
  let maxX = width;
  let maxY = shelfY + shelfHeight;
  for (const point of positions.values()) {
    minX = Math.min(minX, point.x - NODE_RADIUS);
    minY = Math.min(minY, point.y - NODE_RADIUS);
    maxX = Math.max(maxX, point.x + NODE_RADIUS);
    maxY = Math.max(maxY, point.y + NODE_RADIUS);
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

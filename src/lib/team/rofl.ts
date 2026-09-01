// Reading a .rofl — a League replay — for the numbers the series form otherwise
// asks somebody to copy off the end-of-game screen.
//
// A replay carries a plaintext metadata blob alongside its (proprietary,
// encrypted) game payload. That blob holds the final scoreboard: ten players,
// their champions, their K/D/A, their CS, which team won. Everything the entry
// form needs except the bans, which a replay simply does not record.
//
// Two things this deliberately does not do:
//
//   * touch the payload. Nothing here decodes a frame or a keyframe; the file
//     is read for its scoreboard and that is all.
//   * read the whole file. Replays run 10-20MB and the parts that matter are a
//     512-byte header and a ~120KB trailer, so callers hand over a `File` and
//     this slices it. The bytes in between are never loaded, the file is never
//     uploaded, and nothing about it is stored — a replay is a source for a
//     prefill, not a record.
//
// ## The format
//
// Both layouts start "RIOT" followed by a uint16 version.
//
// **Version 2** — everything the client has produced for the last few seasons:
//
//     0x00  "RIOT"
//     0x04  u16   2
//     0x06  8 bytes, content unidentified
//     0x0E  u8    length of the game version string
//     0x0F  ...   "16.17.810.4348"
//     ...         a zstd-compressed section this does not need
//     EOF-4 u32   length of the metadata JSON, which ends where it starts
//
// The trailer is what makes this cheap: the last four bytes say how far back
// the JSON runs, so two small reads get the whole scoreboard without a zstd
// decoder in the bundle.
//
// **Version 1** — the older layout, kept because a replay is readable long
// after the client stops being able to play it back. Its metadata sits after a
// fixed 288-byte header that says where:
//
//     0x00  "RIOT" + two zero bytes
//     0x06  256 bytes signature
//     0x106 u16   header length
//     0x108 u32   file length
//     0x10C u32   metadata offset
//     0x110 u32   metadata length
//
// The version-1 path is written from the documented layout rather than from a
// file in hand — every replay this was tested against is version 2 — so it
// fails with a readable message rather than a wrong prefill if it is off.

/** Which team a player was on. Mirrors TeamSide without importing it, so this stays dependency-free. */
export type RoflSide = "blue" | "red";

export type RoflPlayer = {
  gameName: string;
  tagLine: string;
  /** "name#tag", lowercased — an identity to compare, not to display. */
  riotId: string;
  /**
   * Riot's internal codename, which is exactly DDragon's `id` field:
   * "MonkeyKing" for Wukong, "FiddleSticks" for Fiddlesticks. Case differs
   * between the two often enough that every lookup on it must fold case.
   */
  championKey: string;
  side: RoflSide;
  win: boolean;
  /** "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "UTILITY", or "" on a game that assigned none. */
  role: string;
  kills: number;
  deaths: number;
  assists: number;
  /** Lane minions and jungle camps together, which is what the scoreboard shows. */
  totalCs: number;
};

export type RoflReplay = {
  /** For talking about which file went wrong, nothing else. */
  fileName: string;
  /** "16.17.810.4348" — a build, not a patch. Feed it through patchFromVersion. */
  gameVersion: string;
  durationSeconds: number;
  /** Ten of them, in the order the file lists: blue side first, then red. */
  players: RoflPlayer[];
};

/** A file that isn't a replay, or is one this can't read. The message is shown to a person. */
export class RoflError extends Error {}

const MAGIC = "RIOT";
/** Enough for either header — version 1's runs to 288 bytes. */
const HEADER_PROBE_BYTES = 512;
/** Ten players, always: this reads finished games off a scoreboard. */
const EXPECTED_PLAYERS = 10;
/** A sane ceiling for the metadata trailer, so a corrupt length can't ask for a gigabyte. */
const MAX_METADATA_BYTES = 8 * 1024 * 1024;

const decoder = new TextDecoder();

export async function readRoflFile(file: File): Promise<RoflReplay> {
  const head = new DataView(await sliceBytes(file, 0, Math.min(HEADER_PROBE_BYTES, file.size)));

  if (head.byteLength < 32 || readAscii(head, 0, 4) !== MAGIC) {
    throw new RoflError(`${file.name} isn't a replay file.`);
  }

  const version = head.getUint16(4, true);
  const json =
    version === 2
      ? await readTrailerMetadata(file)
      : version === 0
        ? await readHeaderMetadata(file, head)
        : null;

  if (json === null) {
    throw new RoflError(`${file.name} is a replay format this doesn't know (version ${version}).`);
  }

  return {
    fileName: file.name,
    // Version 2 keeps the game version in its header and drops it from the
    // metadata; version 1 does the reverse. Read whichever this file has.
    gameVersion: version === 2 ? readGameVersion(head) : json.gameVersion ?? "",
    ...parseMetadata(json, file.name),
  };
}

// ------------------------------------------------------------
// Getting at the metadata
// ------------------------------------------------------------

type RoflMetadata = {
  gameLength?: number;
  gameVersion?: string;
  statsJson?: string;
};

async function sliceBytes(file: File, start: number, end: number): Promise<ArrayBuffer> {
  return await file.slice(start, end).arrayBuffer();
}

/** Version 2: the last four bytes say how far back the JSON reaches. */
async function readTrailerMetadata(file: File): Promise<RoflMetadata> {
  if (file.size < 8) throw new RoflError(`${file.name} is too small to be a replay.`);

  const length = new DataView(await sliceBytes(file, file.size - 4, file.size)).getUint32(0, true);
  const start = file.size - 4 - length;
  if (length === 0 || length > MAX_METADATA_BYTES || start < 0) {
    throw new RoflError(
      `${file.name} says its scoreboard is ${length} bytes, which can't be right.`,
    );
  }

  return parseJson(await sliceBytes(file, start, file.size - 4), file.name);
}

/** Version 1: the header says where the metadata is. */
async function readHeaderMetadata(file: File, head: DataView): Promise<RoflMetadata | null> {
  if (head.byteLength < 288) return null;

  const offset = head.getUint32(268, true);
  const length = head.getUint32(272, true);
  if (length === 0 || length > MAX_METADATA_BYTES || offset + length > file.size) {
    throw new RoflError(`${file.name} points at a scoreboard that isn't there.`);
  }

  return parseJson(await sliceBytes(file, offset, offset + length), file.name);
}

function parseJson(bytes: ArrayBuffer, fileName: string): RoflMetadata {
  try {
    return JSON.parse(decoder.decode(bytes)) as RoflMetadata;
  } catch {
    throw new RoflError(`${fileName}: the scoreboard in this replay isn't readable.`);
  }
}

function readAscii(view: DataView, start: number, length: number): string {
  return decoder.decode(new Uint8Array(view.buffer, view.byteOffset + start, length));
}

/**
 * The length-prefixed version string at 0x0E.
 *
 * Returns "" rather than throwing on anything that doesn't look like one: the
 * patch is a prefilled text field somebody can correct, and an odd byte here is
 * no reason to refuse a file whose scoreboard reads fine.
 */
function readGameVersion(head: DataView): string {
  const length = head.getUint8(14);
  if (length === 0 || 15 + length > head.byteLength) return "";
  const value = readAscii(head, 15, length);
  return /^[\d.]+$/.test(value) ? value : "";
}

// ------------------------------------------------------------
// The scoreboard
// ------------------------------------------------------------

/** Every value in statsJson is a string, including the numbers. */
type RawStats = Record<string, string>;

function parseMetadata(
  metadata: RoflMetadata,
  fileName: string,
): { durationSeconds: number; players: RoflPlayer[] } {
  let stats: unknown;
  try {
    stats = JSON.parse(metadata.statsJson ?? "");
  } catch {
    throw new RoflError(`${fileName}: this replay has no scoreboard in it.`);
  }

  if (!Array.isArray(stats) || stats.length !== EXPECTED_PLAYERS) {
    const found = Array.isArray(stats) ? stats.length : 0;
    throw new RoflError(
      `${fileName}: this replay lists ${found} players, not ${EXPECTED_PLAYERS}.`,
    );
  }

  return {
    // Milliseconds in the file, seconds in the column.
    durationSeconds: Math.max(0, Math.round((metadata.gameLength ?? 0) / 1000)),
    players: (stats as RawStats[]).map(toPlayer),
  };
}

function toPlayer(raw: RawStats): RoflPlayer {
  const gameName = text(raw.RIOT_ID_GAME_NAME) || text(raw.NAME);
  const tagLine = text(raw.RIOT_ID_TAG_LINE);

  return {
    gameName,
    tagLine,
    riotId: `${gameName}#${tagLine}`.toLowerCase(),
    championKey: text(raw.SKIN),
    // 100 and 200 are Riot's team ids everywhere, blue and red respectively.
    side: text(raw.TEAM) === "200" ? "red" : "blue",
    win: text(raw.WIN) === "Win",
    // TEAM_POSITION is the assigned role and the one that matches our own
    // vocabulary exactly; INDIVIDUAL_POSITION is where they actually ended up,
    // and only worth reading when the first is blank.
    role: text(raw.TEAM_POSITION) || text(raw.INDIVIDUAL_POSITION),
    kills: int(raw.CHAMPIONS_KILLED),
    deaths: int(raw.NUM_DEATHS),
    assists: int(raw.ASSISTS),
    // The scoreboard's CS is both columns added; a jungler's is nearly all the
    // second one, and storing only lane minions would read as 20 CS in 30
    // minutes.
    totalCs: int(raw.MINIONS_KILLED) + int(raw.NEUTRAL_MINIONS_KILLED),
  };
}

const text = (value: string | undefined): string => (typeof value === "string" ? value.trim() : "");

const int = (value: string | undefined): number => {
  const n = Number(text(value));
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
};

/**
 * The daily challenge, and the archive behind it.
 *
 * There is no backend. The day's puzzle is *derived* from the date through a seeded generator,
 * so every device produces the same puzzle for the same day without anything being fetched,
 * and any past day can be replayed exactly. That is what makes "the whole daily archive" a
 * real feature rather than a promise of content that would have to be shipped later.
 *
 * Pure and dependency-free: the date is always passed in, never read from the clock here.
 */
/** How far back the archive goes. A year of replayable days, generated rather than stored. */
export const ARCHIVE_DAYS = 365;

/**
 * The local calendar day as `YYYY-MM-DD`.
 *
 * Deliberately local rather than `toISOString()`, which is UTC: a UTC key rolls the challenge
 * over at midnight UTC, which is the middle of the afternoon in some places and the small
 * hours in others, so a player's "today" would change underneath them mid-game.
 */
export function dateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parses a `YYYY-MM-DD` key back to a local midnight. */
function fromKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * A 32-bit mulberry32 generator.
 *
 * Small, fast and — the part that matters here — identical on every device and every version
 * of JavaScript, which `Math.random` seeded by any means is not.
 */
export function seededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable 32-bit hash of the date key. */
export function dailySeed(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Today first, then backwards. Never a future day. */
export function archiveDates(today: Date): string[] {
  const out: string[] = [];
  for (let i = 0; i < ARCHIVE_DAYS; i += 1) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - i,
    );
    out.push(dateKey(d));
  }
  return out;
}

/**
 * Whether a day may be played.
 *
 * A free player gets today. A paying player gets the whole archive. **Nobody** gets a future
 * date: the generator would happily produce tomorrow's board, and letting a player finish a
 * challenge before the day it belongs to makes the shared-board idea meaningless.
 */
export function isPlayable(
  key: string,
  today: Date,
  isPremium: boolean,
): boolean {
  const date = fromKey(key);
  if (!date) return false;
  const todayKey = dateKey(today);
  if (key > todayKey) return false;
  if (key === todayKey) return true;
  if (!isPremium) return false;
  return archiveDates(today).includes(key);
}

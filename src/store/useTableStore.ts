/**
 * The deal in play, the undo stack, the table theme and the win-streak record.
 *
 * Three of the paywall's four claims are enforced here — every theme, unlimited undo and
 * hints, and the daily archive with its streak — so each takes `isPremium` explicitly at the
 * call site rather than reaching into another store.
 *
 * All the rules are in `src/logic/klondike.ts`; this only sequences them and persists.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

import {
  type GameState,
  type Source,
  deal,
  drawFromStock,
  findMove,
  hasWon,
  moveTableauRun,
  moveToFoundation,
  moveWasteToTableau,
  recycleWaste,
} from "@/logic/klondike";
import { dailySeed, isPlayable, seededRng } from "@/logic/daily";
import { TABLE_THEMES } from "@/theme/table";

export const TABLE_CACHE_KEY = "klondo.state.v1";

/** Undo steps and hints a free player gets per deal. The purchase lifts both. */
export const FREE_UNDO = 3;
export const FREE_HINTS = 3;
/** A ceiling even for a paying player: an undo stack is not a transaction log. */
const MAX_HISTORY = 200;

export interface DayRecord {
  won: boolean;
  moves: number;
}

interface TableState {
  game: GameState | null;
  dayKey: string | null;
  theme: string;
  history: GameState[];
  undosUsed: number;
  hintsUsed: number;
  moves: number;
  /** Per-day outcome, which is what the streak is computed from. */
  days: Record<string, DayRecord>;

  startDay: (
    key: string,
    today: Date,
    isPremium: boolean,
  ) => "started" | "locked";
  draw: (count?: number) => void;
  recycle: () => void;
  moveRun: (from: number, to: number, fromIndex: number) => void;
  toFoundation: (source: Source) => void;
  wasteToTableau: (to: number) => void;
  undo: (isPremium: boolean) => "undone" | "limit-reached" | "nothing-to-undo";
  hint: (isPremium: boolean) => "applied" | "limit-reached" | "none-available";
  setTheme: (name: string, isPremium: boolean) => void;
  streak: (today: Date) => number;
  /** Records the day as won when a move completes it. Internal, but part of the store's API. */
  recordIfWon: (next: GameState) => void;
  persist: () => Promise<void>;
  hydrate: () => Promise<void>;
}

function validDays(value: unknown): Record<string, DayRecord> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, DayRecord> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !entry || typeof entry !== "object")
      continue;
    const { won, moves } = entry as DayRecord;
    if (typeof won !== "boolean" || typeof moves !== "number") continue;
    out[key] = { won, moves };
  }
  return out;
}

export const useTableStore = create<TableState>((set, get) => ({
  game: null,
  dayKey: null,
  theme: "default",
  history: [],
  undosUsed: 0,
  hintsUsed: 0,
  moves: 0,
  days: {},

  startDay(key, today, isPremium) {
    if (!isPlayable(key, today, isPremium)) return "locked";
    set({
      game: deal(seededRng(dailySeed(key))),
      dayKey: key,
      history: [],
      undosUsed: 0,
      hintsUsed: 0,
      moves: 0,
    });
    void get().persist();
    return "started";
  },

  draw(count = 1) {
    const { game } = get();
    if (!game) return;
    const next = drawFromStock(game, count);
    // An illegal or no-op move returns the same state. Pushing an undo step for it would let
    // a player spend their free undos on moves that did nothing.
    if (next === game) return;
    set((s) => ({
      game: next,
      history: [...s.history, game].slice(-MAX_HISTORY),
      moves: s.moves + 1,
    }));
    void get().persist();
  },

  recycle() {
    const { game } = get();
    if (!game) return;
    const next = recycleWaste(game);
    if (next === game) return;
    set((s) => ({
      game: next,
      history: [...s.history, game].slice(-MAX_HISTORY),
      moves: s.moves + 1,
    }));
    void get().persist();
  },

  moveRun(from, to, fromIndex) {
    const { game } = get();
    if (!game) return;
    const next = moveTableauRun(game, from, to, fromIndex);
    if (next === game) return;
    set((s) => ({
      game: next,
      history: [...s.history, game].slice(-MAX_HISTORY),
      moves: s.moves + 1,
    }));
    get().recordIfWon(next);
  },

  toFoundation(source) {
    const { game } = get();
    if (!game) return;
    const next = moveToFoundation(game, source);
    if (next === game) return;
    set((s) => ({
      game: next,
      history: [...s.history, game].slice(-MAX_HISTORY),
      moves: s.moves + 1,
    }));
    get().recordIfWon(next);
  },

  wasteToTableau(to) {
    const { game } = get();
    if (!game) return;
    const next = moveWasteToTableau(game, to);
    if (next === game) return;
    set((s) => ({
      game: next,
      history: [...s.history, game].slice(-MAX_HISTORY),
      moves: s.moves + 1,
    }));
    get().recordIfWon(next);
  },

  undo(isPremium) {
    const { history, undosUsed } = get();
    // "Nothing to undo" and "you are out of undos" are different answers, and only one of
    // them is a reason to show a purchase prompt.
    if (history.length === 0) return "nothing-to-undo";
    if (!isPremium && undosUsed >= FREE_UNDO) return "limit-reached";
    const previous = history.at(-1)!;
    set((s) => ({
      game: previous,
      history: s.history.slice(0, -1),
      undosUsed: s.undosUsed + 1,
      moves: Math.max(0, s.moves - 1),
    }));
    void get().persist();
    return "undone";
  },

  hint(isPremium) {
    const { game, hintsUsed } = get();
    if (!game) return "none-available";
    if (!isPremium && hintsUsed >= FREE_HINTS) return "limit-reached";
    const move = findMove(game);
    if (!move) return "none-available";
    const next = move.apply(game);
    set((s) => ({
      game: next,
      history: [...s.history, game].slice(-MAX_HISTORY),
      hintsUsed: s.hintsUsed + 1,
      moves: s.moves + 1,
    }));
    get().recordIfWon(next);
    return "applied";
  },

  setTheme(name, isPremium) {
    if (!(name in TABLE_THEMES)) return;
    if (!isPremium && name !== "default") return;
    set({ theme: name });
    void get().persist();
  },

  /**
   * Consecutive days won, counting back from today.
   *
   * Today not being won yet does not break a streak — the day is not over. Yesterday not
   * being won does.
   */
  streak(today) {
    const { days } = get();
    let count = 0;
    for (let back = 0; back < 400; back += 1) {
      const date = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - back,
      );
      const key = `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, "0")}-${`${date.getDate()}`.padStart(2, "0")}`;
      const record = days[key];
      if (record?.won) {
        count += 1;
        continue;
      }
      if (back === 0) continue;
      break;
    }
    return count;
  },

  async persist() {
    const { theme, days, dayKey } = get();
    try {
      // The deal itself is not written: it is derived from the day, and a resumed mid-game
      // board would disagree with the move count and the undo stack.
      await AsyncStorage.setItem(
        TABLE_CACHE_KEY,
        JSON.stringify({ theme, days, dayKey }),
      );
    } catch {
      // A lost record is survivable; a failed launch is not.
    }
  },

  async hydrate() {
    try {
      const raw = await AsyncStorage.getItem(TABLE_CACHE_KEY);
      if (!raw) return;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return;
      const record = parsed as Record<string, unknown>;
      set({
        theme:
          typeof record.theme === "string" && record.theme in TABLE_THEMES
            ? record.theme
            : "default",
        days: validDays(record.days),
        game: null,
        dayKey: null,
        history: [],
        undosUsed: 0,
        hintsUsed: 0,
        moves: 0,
      });
    } catch {
      // Unreadable storage starts clean rather than preventing launch.
    }
  },

  recordIfWon(next: GameState) {
    const { dayKey, moves } = get();
    if (!dayKey || !hasWon(next)) {
      void get().persist();
      return;
    }
    set((s) => ({ days: { ...s.days, [dayKey]: { won: true, moves } } }));
    void get().persist();
  },
}));

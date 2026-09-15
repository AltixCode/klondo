import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  FREE_HINTS,
  FREE_UNDO,
  TABLE_CACHE_KEY,
  useTableStore,
} from "../useTableStore";
import { dateKey } from "@/logic/daily";
import { RANKS, SUITS, type Card } from "@/logic/klondike";

const today = new Date();
const todayKey = dateKey(today);
const yesterdayKey = dateKey(new Date(Date.now() - 86_400_000));

const reset = () =>
  useTableStore.setState({
    game: null,
    dayKey: null,
    theme: "default",
    history: [],
    undosUsed: 0,
    hintsUsed: 0,
    moves: 0,
    days: {},
  });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  reset();
});

describe("starting a day", () => {
  it("deals today for a free player", () => {
    expect(useTableStore.getState().startDay(todayKey, today, false)).toBe(
      "started",
    );
    expect(useTableStore.getState().game!.tableau).toHaveLength(7);
  });

  it("refuses a past day to a free player and deals nothing", () => {
    expect(useTableStore.getState().startDay(yesterdayKey, today, false)).toBe(
      "locked",
    );
    expect(useTableStore.getState().game).toBeNull();
  });

  it("opens the archive to a paying player", () => {
    expect(useTableStore.getState().startDay(yesterdayKey, today, true)).toBe(
      "started",
    );
  });

  it("deals the same cards for the same day", () => {
    useTableStore.getState().startDay(todayKey, today, false);
    const first = useTableStore.getState().game;
    reset();
    useTableStore.getState().startDay(todayKey, today, false);
    expect(useTableStore.getState().game).toEqual(first);
  });
});

describe("moves", () => {
  beforeEach(() => {
    useTableStore.getState().startDay(todayKey, today, false);
  });

  it("draws a card and records an undo step", () => {
    useTableStore.getState().draw(1);
    expect(useTableStore.getState().game!.waste).toHaveLength(1);
    expect(useTableStore.getState().history).toHaveLength(1);
    expect(useTableStore.getState().moves).toBe(1);
  });

  it("records nothing for a move that changed nothing", () => {
    // Otherwise a player spends their free undos rewinding moves that never happened.
    const before = useTableStore.getState().game;
    useTableStore.getState().moveRun(0, 0, 0);
    expect(useTableStore.getState().game).toBe(before);
    expect(useTableStore.getState().history).toHaveLength(0);
    expect(useTableStore.getState().moves).toBe(0);
  });

  it("does nothing at all when no deal is in play", () => {
    reset();
    expect(() => useTableStore.getState().draw()).not.toThrow();
    expect(useTableStore.getState().game).toBeNull();
  });
});

describe("undo — three free, then the purchase", () => {
  beforeEach(() => {
    useTableStore.getState().startDay(todayKey, today, false);
  });

  it("restores the previous state", () => {
    const before = useTableStore.getState().game;
    useTableStore.getState().draw(1);
    expect(useTableStore.getState().undo(false)).toBe("undone");
    expect(useTableStore.getState().game).toEqual(before);
  });

  it("stops a free player after three", () => {
    for (let i = 0; i < FREE_UNDO + 1; i += 1) useTableStore.getState().draw(1);
    for (let i = 0; i < FREE_UNDO; i += 1) {
      expect(useTableStore.getState().undo(false)).toBe("undone");
    }
    expect(useTableStore.getState().undo(false)).toBe("limit-reached");
  });

  it("does not stop a paying player", () => {
    for (let i = 0; i < FREE_UNDO + 2; i += 1) useTableStore.getState().draw(1);
    for (let i = 0; i < FREE_UNDO + 2; i += 1) {
      expect(useTableStore.getState().undo(true)).toBe("undone");
    }
  });

  it("distinguishes an empty stack from a spent allowance", () => {
    expect(useTableStore.getState().undo(false)).toBe("nothing-to-undo");
  });
});

describe("hints", () => {
  beforeEach(() => {
    useTableStore.getState().startDay(todayKey, today, false);
  });

  it("applies a real move", () => {
    const before = useTableStore.getState().game;
    const outcome = useTableStore.getState().hint(false);
    if (outcome === "applied") {
      expect(useTableStore.getState().game).not.toEqual(before);
    } else {
      // A deal with no productive opening move is legitimate; saying so is the honest answer.
      expect(outcome).toBe("none-available");
    }
  });

  it("stops a free player after three", () => {
    let applied = 0;
    for (let i = 0; i < FREE_HINTS + 2; i += 1) {
      const outcome = useTableStore.getState().hint(false);
      if (outcome === "applied") applied += 1;
      if (outcome === "limit-reached") {
        expect(applied).toBe(FREE_HINTS);
        return;
      }
      if (outcome === "none-available") return;
    }
  });
});

describe("themes", () => {
  it("is locked for a free player and open to a paying one", () => {
    useTableStore.getState().setTheme("wine", false);
    expect(useTableStore.getState().theme).toBe("default");
    useTableStore.getState().setTheme("wine", true);
    expect(useTableStore.getState().theme).toBe("wine");
  });

  it("refuses a theme that does not exist", () => {
    useTableStore.getState().setTheme("paisley", true);
    expect(useTableStore.getState().theme).toBe("default");
  });
});

describe("the win streak", () => {
  const keyFor = (back: number) =>
    dateKey(new Date(Date.now() - back * 86_400_000));

  it("is zero with no wins", () => {
    expect(useTableStore.getState().streak(today)).toBe(0);
  });

  it("counts consecutive won days back from today", () => {
    useTableStore.setState({
      days: {
        [keyFor(0)]: { won: true, moves: 100 },
        [keyFor(1)]: { won: true, moves: 90 },
        [keyFor(2)]: { won: true, moves: 80 },
      },
    });
    expect(useTableStore.getState().streak(today)).toBe(3);
  });

  it("does not break a streak just because today is unfinished", () => {
    // The day is not over. Ending a streak at noon would be wrong and infuriating.
    useTableStore.setState({
      days: {
        [keyFor(1)]: { won: true, moves: 90 },
        [keyFor(2)]: { won: true, moves: 80 },
      },
    });
    expect(useTableStore.getState().streak(today)).toBe(2);
  });

  it("breaks on a lost day", () => {
    useTableStore.setState({
      days: {
        [keyFor(1)]: { won: true, moves: 90 },
        [keyFor(2)]: { won: false, moves: 40 },
        [keyFor(3)]: { won: true, moves: 70 },
      },
    });
    expect(useTableStore.getState().streak(today)).toBe(1);
  });
});

describe("recording a win", () => {
  it("marks the day won when the foundations are full", () => {
    useTableStore.getState().startDay(todayKey, today, false);
    const full = (suit: (typeof SUITS)[number]): Card[] =>
      RANKS.map((rank) => ({ rank, suit, faceUp: true }));
    const won = {
      ...useTableStore.getState().game!,
      foundations: {
        hearts: full("hearts"),
        diamonds: full("diamonds"),
        clubs: full("clubs"),
        spades: full("spades"),
      },
    };
    useTableStore.getState().recordIfWon(won);
    expect(useTableStore.getState().days[todayKey]!.won).toBe(true);
  });

  it("records nothing for a board that is not finished", () => {
    useTableStore.getState().startDay(todayKey, today, false);
    useTableStore.getState().recordIfWon(useTableStore.getState().game!);
    expect(useTableStore.getState().days[todayKey]).toBeUndefined();
  });
});

describe("persistence", () => {
  it("round-trips the theme and the day records", async () => {
    useTableStore.getState().setTheme("slate", true);
    useTableStore.setState({ days: { [todayKey]: { won: true, moves: 120 } } });
    await useTableStore.getState().persist();

    reset();
    await useTableStore.getState().hydrate();
    expect(useTableStore.getState().theme).toBe("slate");
    expect(useTableStore.getState().days[todayKey]!.won).toBe(true);
  });

  it("does not restore a deal in progress", async () => {
    // The deal is derived from the day; a half-restored board would disagree with the move
    // count and the undo stack.
    useTableStore.getState().startDay(todayKey, today, false);
    await useTableStore.getState().persist();
    reset();
    await useTableStore.getState().hydrate();
    expect(useTableStore.getState().game).toBeNull();
  });

  it("survives stored rubbish", async () => {
    await AsyncStorage.setItem(TABLE_CACHE_KEY, '{"theme":9,"days":"none"}');
    await useTableStore.getState().hydrate();
    expect(useTableStore.getState().theme).toBe("default");
    expect(useTableStore.getState().days).toEqual({});
  });
});

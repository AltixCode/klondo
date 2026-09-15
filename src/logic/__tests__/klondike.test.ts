import {
  type Card,
  type GameState,
  RANKS,
  SUITS,
  canStackOnFoundation,
  canStackOnTableau,
  colourOf,
  deal,
  drawFromStock,
  fullDeck,
  hasWon,
  moveToFoundation,
  moveTableauRun,
  newGame,
  recycleWaste,
} from "../klondike";

const card = (
  rank: number,
  suit: (typeof SUITS)[number],
  faceUp = true,
): Card => ({
  rank,
  suit,
  faceUp,
});

/** Deterministic shuffle source. */
const rng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
};

describe("the deck", () => {
  it("is 52 distinct cards", () => {
    const deck = fullDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });

  it("has thirteen ranks in each of four suits", () => {
    expect(RANKS).toHaveLength(13);
    expect(SUITS).toHaveLength(4);
  });

  it("assigns colours the way a deck does", () => {
    expect(colourOf("hearts")).toBe("red");
    expect(colourOf("diamonds")).toBe("red");
    expect(colourOf("clubs")).toBe("black");
    expect(colourOf("spades")).toBe("black");
  });
});

describe("deal", () => {
  const state = deal(rng(42));

  it("lays out seven columns of increasing length", () => {
    state.tableau.forEach((column, i) => expect(column).toHaveLength(i + 1));
  });

  it("turns up exactly the last card of each column", () => {
    // Turning up more would give away the game; turning up fewer makes it unplayable.
    for (const column of state.tableau) {
      expect(column.at(-1)!.faceUp).toBe(true);
      expect(column.slice(0, -1).every((c) => !c.faceUp)).toBe(true);
    }
  });

  it("puts the remaining 24 cards in the stock, face down", () => {
    expect(state.stock).toHaveLength(52 - 28);
    expect(state.stock.every((c) => !c.faceUp)).toBe(true);
  });

  it("starts with empty foundations and waste", () => {
    expect(state.waste).toHaveLength(0);
    expect(Object.values(state.foundations).every((f) => f.length === 0)).toBe(
      true,
    );
  });

  it("uses every card exactly once", () => {
    const all = [...state.tableau.flat(), ...state.stock, ...state.waste];
    expect(all).toHaveLength(52);
    expect(new Set(all.map((c) => `${c.rank}${c.suit}`)).size).toBe(52);
  });

  it("is deterministic for a seed — the daily deal is the same for everyone", () => {
    expect(deal(rng(7))).toEqual(deal(rng(7)));
  });
});

describe("canStackOnTableau", () => {
  it("accepts a descending card of the opposite colour", () => {
    expect(canStackOnTableau(card(6, "hearts"), card(7, "spades"))).toBe(true);
  });

  it("refuses the same colour, however the ranks run", () => {
    expect(canStackOnTableau(card(6, "hearts"), card(7, "diamonds"))).toBe(
      false,
    );
  });

  it("refuses a rank that does not descend by exactly one", () => {
    expect(canStackOnTableau(card(5, "hearts"), card(7, "spades"))).toBe(false);
    expect(canStackOnTableau(card(8, "hearts"), card(7, "spades"))).toBe(false);
  });

  it("allows only a king onto an empty column", () => {
    // The rule that makes Klondike hard. Anything else would trivialise it.
    expect(canStackOnTableau(card(13, "hearts"), null)).toBe(true);
    expect(canStackOnTableau(card(12, "hearts"), null)).toBe(false);
  });

  it("refuses to stack onto a face-down card", () => {
    expect(canStackOnTableau(card(6, "hearts"), card(7, "spades", false))).toBe(
      false,
    );
  });
});

describe("canStackOnFoundation", () => {
  it("starts a foundation with an ace and nothing else", () => {
    expect(canStackOnFoundation(card(1, "hearts"), [])).toBe(true);
    expect(canStackOnFoundation(card(2, "hearts"), [])).toBe(false);
  });

  it("builds up in suit, one at a time", () => {
    const pile = [card(1, "hearts")];
    expect(canStackOnFoundation(card(2, "hearts"), pile)).toBe(true);
    expect(canStackOnFoundation(card(3, "hearts"), pile)).toBe(false);
    expect(canStackOnFoundation(card(2, "spades"), pile)).toBe(false);
  });
});

describe("drawing", () => {
  it("moves cards from stock to waste, face up", () => {
    const state = deal(rng(1));
    const next = drawFromStock(state, 1);
    expect(next.waste).toHaveLength(1);
    expect(next.waste.at(-1)!.faceUp).toBe(true);
    expect(next.stock).toHaveLength(state.stock.length - 1);
  });

  it("draws three at a time when asked", () => {
    expect(drawFromStock(deal(rng(1)), 3).waste).toHaveLength(3);
  });

  it("does nothing when the stock is empty rather than dealing nothing forever", () => {
    const state: GameState = { ...deal(rng(1)), stock: [] };
    expect(drawFromStock(state, 1)).toEqual(state);
  });

  it("recycles the waste back into the stock, face down and in order", () => {
    let state = deal(rng(1));
    while (state.stock.length > 0) state = drawFromStock(state, 3);
    const wasteCount = state.waste.length;

    const recycled = recycleWaste(state);
    expect(recycled.stock).toHaveLength(wasteCount);
    expect(recycled.waste).toHaveLength(0);
    expect(recycled.stock.every((c) => !c.faceUp)).toBe(true);
  });

  it("will not recycle while the stock still has cards", () => {
    const state = deal(rng(1));
    expect(recycleWaste(state)).toEqual(state);
  });
});

describe("moving a run between columns", () => {
  it("moves a valid run and turns up the card it uncovers", () => {
    // The uncovered card must be turned up, or the column becomes unplayable.
    const state: GameState = {
      ...deal(rng(3)),
      tableau: [
        [card(5, "clubs", false), card(7, "hearts")],
        [card(8, "spades")],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    const next = moveTableauRun(state, 0, 1, 1);
    expect(next.tableau[1]).toHaveLength(2);
    expect(next.tableau[0]).toHaveLength(1);
    expect(next.tableau[0]![0]!.faceUp).toBe(true);
  });

  it("refuses a move that breaks the stacking rule", () => {
    const state: GameState = {
      ...deal(rng(3)),
      tableau: [[card(7, "hearts")], [card(8, "diamonds")], [], [], [], [], []],
    };
    expect(moveTableauRun(state, 0, 1, 0)).toEqual(state);
  });

  it("refuses to move a face-down card", () => {
    const state: GameState = {
      ...deal(rng(3)),
      tableau: [
        [card(7, "hearts", false)],
        [card(8, "spades")],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    expect(moveTableauRun(state, 0, 1, 0)).toEqual(state);
  });

  it("moves a whole run, not just the top card", () => {
    const state: GameState = {
      ...deal(rng(3)),
      tableau: [
        [card(7, "hearts"), card(6, "spades"), card(5, "diamonds")],
        [card(8, "spades")],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    const next = moveTableauRun(state, 0, 1, 0);
    expect(next.tableau[1]).toHaveLength(4);
    expect(next.tableau[0]).toHaveLength(0);
  });

  it("refuses a run that is not itself a valid sequence", () => {
    const state: GameState = {
      ...deal(rng(3)),
      tableau: [
        [card(7, "hearts"), card(2, "clubs")],
        [card(8, "spades")],
        [],
        [],
        [],
        [],
        [],
      ],
    };
    expect(moveTableauRun(state, 0, 1, 0)).toEqual(state);
  });
});

describe("moving to a foundation", () => {
  it("takes the top tableau card when it fits", () => {
    const state: GameState = {
      ...deal(rng(4)),
      tableau: [[card(1, "hearts")], [], [], [], [], [], []],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
    };
    const next = moveToFoundation(state, { from: "tableau", column: 0 });
    expect(next.foundations.hearts).toHaveLength(1);
    expect(next.tableau[0]).toHaveLength(0);
  });

  it("takes the waste card when it fits", () => {
    const state: GameState = {
      ...deal(rng(4)),
      waste: [card(1, "spades")],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
    };
    const next = moveToFoundation(state, { from: "waste" });
    expect(next.foundations.spades).toHaveLength(1);
    expect(next.waste).toHaveLength(0);
  });

  it("refuses a card that does not fit", () => {
    const state: GameState = {
      ...deal(rng(4)),
      waste: [card(5, "spades")],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
    };
    expect(moveToFoundation(state, { from: "waste" })).toEqual(state);
  });
});

describe("winning", () => {
  it("is won when all four foundations hold thirteen cards", () => {
    const full = (suit: (typeof SUITS)[number]) =>
      RANKS.map((r) => card(r, suit));
    const state: GameState = {
      ...newGame(rng(1)),
      foundations: {
        hearts: full("hearts"),
        diamonds: full("diamonds"),
        clubs: full("clubs"),
        spades: full("spades"),
      },
    };
    expect(hasWon(state)).toBe(true);
  });

  it("is not won at the start", () => {
    expect(hasWon(newGame(rng(1)))).toBe(false);
  });
});

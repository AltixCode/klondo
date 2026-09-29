import {
  type Card,
  type GameState,
  RANKS,
  SUITS,
  canAutoComplete,
  canStackOnFoundation,
  canStackOnTableau,
  colourOf,
  deal,
  drawFromStock,
  findMove,
  fullDeck,
  hasWon,
  moveToFoundation,
  moveTableauRun,
  newGame,
  nextAutoCompleteAction,
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

describe("findMove — hints", () => {
  it("finds a foundation move over anything else", () => {
    const state: GameState = {
      ...deal(rng(4)),
      tableau: [[card(1, "hearts")], [], [], [], [], [], []],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
      waste: [],
      stock: [],
    };
    expect(findMove(state)?.label).toBe("foundation:0");
  });

  it("finds a tableau move that uncovers a hidden card", () => {
    const state: GameState = {
      ...deal(rng(4)),
      tableau: [
        [card(5, "clubs", false), card(7, "hearts")],
        [card(8, "spades")],
        [],
        [],
        [],
        [],
        [],
      ],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
      waste: [],
      stock: [],
    };
    expect(findMove(state)?.label).toBe("tableau:0:1");
  });

  // A tester reported exactly this: a black 6 sitting alone on its own column, with a red 7
  // exposed two columns over, and the hint button doing nothing about it. The old
  // implementation only ever looked at tableau moves that uncovered a face-down card, so a
  // card that was already fully exposed -- most often the single card dealt to a column --
  // was invisible to it no matter how obviously it belonged somewhere else.
  it("finds a move for a fully-exposed card with nothing left to uncover", () => {
    const state: GameState = {
      ...deal(rng(4)),
      tableau: [
        [card(6, "spades")], // Single card column: nothing hidden underneath.
        [],
        [],
        [],
        [],
        [card(7, "hearts")],
        [],
      ],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
      waste: [],
      stock: [],
    };
    const move = findMove(state);
    expect(move).not.toBeNull();
    expect(move!.label).toBe("tableau:0:5");
    const next = move!.apply(state);
    expect(next.tableau[0]).toHaveLength(0);
    expect(next.tableau[5]!.map((c) => `${c.rank}${c.suit}`)).toEqual([
      "7hearts",
      "6spades",
    ]);
  });

  it("also finds it when the exposed card frees a foundation-ready card underneath", () => {
    const state: GameState = {
      ...deal(rng(4)),
      tableau: [
        // 9♠ sits on 10♥; 10♥ is ready for hearts the moment 9♠ leaves.
        [card(10, "hearts"), card(9, "spades")],
        [],
        [],
        [],
        [card(10, "diamonds")],
        [],
        [],
      ],
      foundations: {
        hearts: RANKS.slice(0, 9).map((r) => card(r, "hearts")),
        diamonds: [],
        clubs: [],
        spades: [],
      },
      waste: [],
      stock: [],
    };
    const move = findMove(state);
    expect(move).not.toBeNull();
    expect(move!.label).toBe("tableau:0:4");
    const next = move!.apply(state);
    expect(next.tableau[0]).toEqual([card(10, "hearts")]);
  });

  it("does not recommend shuffling an exposed card sideways for no reason", () => {
    // 6♠ could legally sit on 7♥, but neither move frees anything -- the source column
    // would still have a card in it, and nothing about it is foundation-ready. Recommending
    // it would spend a hint on a move worth exactly as much as staying put.
    const state: GameState = {
      ...deal(rng(4)),
      tableau: [
        [card(3, "clubs"), card(6, "spades")],
        [],
        [],
        [],
        [],
        [card(7, "hearts")],
        [],
      ],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
      waste: [],
      stock: [],
    };
    expect(findMove(state)).toBeNull();
  });

  it("returns null when the deal genuinely has no move", () => {
    const state: GameState = {
      ...deal(rng(4)),
      tableau: [[], [], [], [], [], [], []],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
      waste: [],
      stock: [],
    };
    expect(findMove(state)).toBeNull();
  });
});

describe("canAutoComplete", () => {
  it("is false while any tableau card is still face down", () => {
    expect(canAutoComplete(deal(rng(1)))).toBe(false);
  });

  it("is true once every tableau card is face up, stock and waste or not", () => {
    const state: GameState = {
      ...deal(rng(1)),
      tableau: [[card(6, "spades")], [], [card(5, "hearts")], [], [], [], []],
    };
    expect(canAutoComplete(state)).toBe(true);
  });

  it("is false once the game is already won", () => {
    const full = (suit: (typeof SUITS)[number]) =>
      RANKS.map((r) => card(r, suit));
    const state: GameState = {
      ...deal(rng(1)),
      tableau: [[], [], [], [], [], [], []],
      foundations: {
        hearts: full("hearts"),
        diamonds: full("diamonds"),
        clubs: full("clubs"),
        spades: full("spades"),
      },
    };
    expect(canAutoComplete(state)).toBe(false);
  });
});

describe("nextAutoCompleteAction", () => {
  const empty = (): GameState => ({
    tableau: [[], [], [], [], [], [], []],
    foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
    stock: [],
    waste: [],
  });

  it("returns null once the game is won", () => {
    const full = (suit: (typeof SUITS)[number]) =>
      RANKS.map((r) => card(r, suit));
    expect(
      nextAutoCompleteAction({
        ...empty(),
        foundations: {
          hearts: full("hearts"),
          diamonds: full("diamonds"),
          clubs: full("clubs"),
          spades: full("spades"),
        },
      }),
    ).toBeNull();
  });

  it("prefers a ready tableau card over anything else", () => {
    const state: GameState = {
      ...empty(),
      tableau: [[card(1, "hearts")], [], [], [], [], [], []],
      stock: [card(1, "spades")],
    };
    expect(nextAutoCompleteAction(state)).toEqual({
      type: "foundation",
      source: { from: "tableau", column: 0 },
    });
  });

  it("plays the waste top when no tableau card is ready", () => {
    const state: GameState = { ...empty(), waste: [card(1, "hearts")] };
    expect(nextAutoCompleteAction(state)).toEqual({
      type: "foundation",
      source: { from: "waste" },
    });
  });

  it("draws when nothing is playable but the stock still has cards", () => {
    const state: GameState = { ...empty(), stock: [card(9, "hearts")] };
    expect(nextAutoCompleteAction(state)).toEqual({ type: "draw" });
  });

  it("relocates a blocking card once the stock is empty", () => {
    const state: GameState = {
      ...empty(),
      tableau: [
        [card(10, "hearts"), card(9, "spades")],
        [],
        [],
        [],
        [card(10, "diamonds")],
        [],
        [],
      ],
      foundations: {
        hearts: RANKS.slice(0, 9).map((r) => card(r, "hearts")),
        diamonds: [],
        clubs: [],
        spades: [],
      },
    };
    expect(nextAutoCompleteAction(state)).toEqual({
      type: "tableau",
      from: 0,
      to: 4,
    });
  });

  it("recycles once the stock is empty and nothing else can move", () => {
    const state: GameState = { ...empty(), waste: [card(9, "hearts")] };
    expect(nextAutoCompleteAction(state)).toEqual({ type: "recycle" });
  });

  it("drives a fully face-up deal to completion", () => {
    // Empty tableau (vacuously all-face-up) with a deliberately adversarial stock order:
    // every suit is drawn king-first, ace-last, which forces at least one recycle per suit
    // before any foundation move is possible at all.
    let state: GameState = {
      ...empty(),
      stock: fullDeck(), // index 0 = hearts A..K ... index 51 = spades A..K; drawn from the end.
    };
    let steps = 0;
    for (;;) {
      const action = nextAutoCompleteAction(state);
      if (!action) break;
      steps += 1;
      expect(steps).toBeLessThan(2000); // Termination guard, not a tuned bound.
      if (action.type === "draw") state = drawFromStock(state, 1);
      else if (action.type === "recycle") state = recycleWaste(state);
      else if (action.type === "tableau")
        state = moveTableauRun(
          state,
          action.from,
          action.to,
          state.tableau[action.from]!.length - 1,
        );
      else state = moveToFoundation(state, action.source);
    }
    expect(hasWon(state)).toBe(true);
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

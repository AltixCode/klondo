/**
 * Klondike solitaire.
 *
 * Pure and dependency-free with the shuffle source injected, so the daily deal is reproducible
 * from its date and every rule is testable from `npm test` alone.
 *
 * Every function returns a new state; nothing mutates its argument. That is what lets the
 * store keep an undo stack by simply holding previous values, and it is also why an illegal
 * move can be expressed as "return the state unchanged" rather than as a thrown error the
 * screen would have to catch on a mistap.
 */

export const SUITS = ["hearts", "diamonds", "clubs", "spades"] as const;
export type Suit = (typeof SUITS)[number];
export type Colour = "red" | "black";

/** Ace is 1 and king is 13, so "one higher" is arithmetic rather than a lookup. */
export const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];

export interface Card {
  rank: number;
  suit: Suit;
  faceUp: boolean;
}

export interface GameState {
  /** Seven columns. Index 0 has one card, index 6 has seven. */
  tableau: Card[][];
  foundations: Record<Suit, Card[]>;
  stock: Card[];
  waste: Card[];
}

export type Source = { from: "waste" } | { from: "tableau"; column: number };

type Rng = () => number;

export const colourOf = (suit: Suit): Colour =>
  suit === "hearts" || suit === "diamonds" ? "red" : "black";

export function fullDeck(): Card[] {
  return SUITS.flatMap((suit) =>
    RANKS.map((rank) => ({ rank, suit, faceUp: false })),
  );
}

function shuffle(cards: Card[], rng: Rng): Card[] {
  const out = [...cards];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rng() * (i + 1)));
    const a = out[i]!;
    out[i] = out[j]!;
    out[j] = a;
  }
  return out;
}

/** Seven columns of 1..7, last card of each face up, the rest to the stock. */
export function deal(rng: Rng = Math.random): GameState {
  const deck = shuffle(fullDeck(), rng);
  const tableau: Card[][] = [];
  let next = 0;
  for (let column = 0; column < 7; column += 1) {
    const cards: Card[] = [];
    for (let i = 0; i <= column; i += 1) {
      // Only the last card of a column is turned up. More would give the game away; fewer
      // would leave the column unplayable.
      cards.push({ ...deck[next]!, faceUp: i === column });
      next += 1;
    }
    tableau.push(cards);
  }
  return {
    tableau,
    foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
    stock: deck.slice(next).map((c) => ({ ...c, faceUp: false })),
    waste: [],
  };
}

export const newGame = deal;

/**
 * Whether `card` may be placed on `onto`.
 *
 * `null` means an empty column, which only a king may take — the rule that makes Klondike
 * hard rather than a shuffling exercise.
 */
export function canStackOnTableau(card: Card, onto: Card | null): boolean {
  if (onto === null) return card.rank === 13;
  if (!onto.faceUp) return false;
  return (
    colourOf(card.suit) !== colourOf(onto.suit) && card.rank === onto.rank - 1
  );
}

/** Foundations start with an ace and build up in suit. */
export function canStackOnFoundation(card: Card, pile: Card[]): boolean {
  const top = pile.at(-1);
  if (!top) return card.rank === 1;
  return card.suit === top.suit && card.rank === top.rank + 1;
}

/** Whether a slice of a column is itself a legal descending, alternating-colour run. */
function isRun(cards: Card[]): boolean {
  if (cards.some((c) => !c.faceUp)) return false;
  for (let i = 1; i < cards.length; i += 1) {
    if (!canStackOnTableau(cards[i]!, cards[i - 1]!)) return false;
  }
  return true;
}

/** Turns up a column's new top card. A face-down top card is a dead column. */
function reveal(column: Card[]): Card[] {
  const top = column.at(-1);
  if (!top || top.faceUp) return column;
  return [...column.slice(0, -1), { ...top, faceUp: true }];
}

export function drawFromStock(state: GameState, count: number): GameState {
  if (state.stock.length === 0) return state;
  const taken = state.stock.slice(-count).reverse();
  return {
    ...state,
    stock: state.stock.slice(0, Math.max(0, state.stock.length - count)),
    waste: [...state.waste, ...taken.map((c) => ({ ...c, faceUp: true }))],
  };
}

/**
 * Turns the waste back into the stock.
 *
 * Refused while the stock still has cards: recycling early would let a player reorder the
 * waste at will, which is a different game.
 */
export function recycleWaste(state: GameState): GameState {
  if (state.stock.length > 0 || state.waste.length === 0) return state;
  return {
    ...state,
    stock: [...state.waste].reverse().map((c) => ({ ...c, faceUp: false })),
    waste: [],
  };
}

/**
 * Moves a run from one column to another.
 *
 * `fromIndex` is where the run starts within the source column, so a player can pick up a
 * sequence from the middle rather than only the top card.
 */
export function moveTableauRun(
  state: GameState,
  from: number,
  to: number,
  fromIndex: number,
): GameState {
  const source = state.tableau[from];
  const target = state.tableau[to];
  if (!source || !target || from === to) return state;

  const run = source.slice(fromIndex);
  if (run.length === 0 || !isRun(run)) return state;
  if (!canStackOnTableau(run[0]!, target.at(-1) ?? null)) return state;

  const tableau = state.tableau.map((column, i) => {
    if (i === from) return reveal(column.slice(0, fromIndex));
    if (i === to) return [...column, ...run];
    return column;
  });
  return { ...state, tableau };
}

/** Sends the top card of the waste or a column to its foundation, when it fits. */
export function moveToFoundation(state: GameState, source: Source): GameState {
  const card =
    source.from === "waste"
      ? state.waste.at(-1)
      : state.tableau[source.column]?.at(-1);
  if (!card || !card.faceUp) return state;
  if (!canStackOnFoundation(card, state.foundations[card.suit])) return state;

  const foundations = {
    ...state.foundations,
    [card.suit]: [...state.foundations[card.suit], card],
  };
  if (source.from === "waste") {
    return { ...state, foundations, waste: state.waste.slice(0, -1) };
  }
  return {
    ...state,
    foundations,
    tableau: state.tableau.map((column, i) =>
      i === source.column ? reveal(column.slice(0, -1)) : column,
    ),
  };
}

/** Moves the top card of the waste onto a tableau column, when it fits. */
export function moveWasteToTableau(state: GameState, to: number): GameState {
  const card = state.waste.at(-1);
  const target = state.tableau[to];
  if (!card || !target) return state;
  if (!canStackOnTableau(card, target.at(-1) ?? null)) return state;
  return {
    ...state,
    waste: state.waste.slice(0, -1),
    tableau: state.tableau.map((column, i) =>
      i === to ? [...column, card] : column,
    ),
  };
}

export function hasWon(state: GameState): boolean {
  return SUITS.every((suit) => state.foundations[suit].length === RANKS.length);
}

/**
 * A move a player could make right now, or null.
 *
 * Foundation moves first, then tableau moves that uncover a face-down card — the two that
 * actually make progress. A hint that suggests shuffling two exposed cards back and forth is
 * worse than no hint.
 */
export function findMove(
  state: GameState,
): { label: string; apply: (s: GameState) => GameState } | null {
  for (let column = 0; column < state.tableau.length; column += 1) {
    const card = state.tableau[column]!.at(-1);
    if (card && canStackOnFoundation(card, state.foundations[card.suit])) {
      return {
        label: `foundation:${column}`,
        apply: (s) => moveToFoundation(s, { from: "tableau", column }),
      };
    }
  }
  const wasteCard = state.waste.at(-1);
  if (
    wasteCard &&
    canStackOnFoundation(wasteCard, state.foundations[wasteCard.suit])
  ) {
    return {
      label: "foundation:waste",
      apply: (s) => moveToFoundation(s, { from: "waste" }),
    };
  }

  for (let from = 0; from < state.tableau.length; from += 1) {
    const column = state.tableau[from]!;
    const firstFaceUp = column.findIndex((c) => c.faceUp);
    if (firstFaceUp <= 0) continue; // Nothing hidden underneath to uncover.
    for (let to = 0; to < state.tableau.length; to += 1) {
      if (to === from) continue;
      if (moveTableauRun(state, from, to, firstFaceUp) !== state) {
        return {
          label: `tableau:${from}:${to}`,
          apply: (s) => moveTableauRun(s, from, to, firstFaceUp),
        };
      }
    }
  }
  return null;
}

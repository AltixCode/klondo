import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTableStore } from '../useTableStore';
import { type Card, type GameState, type Suit } from '@/logic/klondike';

const card = (rank: number, suit: Suit, faceUp = true): Card => ({ rank, suit, faceUp });

/** A hand-built table, so each move has a known right answer. */
const table = (overrides: Partial<GameState>): GameState => ({
  tableau: [[], [], [], [], [], [], []],
  foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
  stock: [],
  waste: [],
  ...overrides,
});

const load = (game: GameState) =>
  useTableStore.setState({
    game,
    dayKey: '2026-09-15',
    theme: 'default',
    history: [],
    undosUsed: 0,
    hintsUsed: 0,
    moves: 0,
    days: {},
  });

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
});

describe('moveRun through the store', () => {
  it('moves a run and records one move', () => {
    load(
      table({
        tableau: [[card(7, 'hearts')], [card(8, 'spades')], [], [], [], [], []],
      }),
    );
    useTableStore.getState().moveRun(0, 1, 0);
    expect(useTableStore.getState().game!.tableau[1]).toHaveLength(2);
    expect(useTableStore.getState().moves).toBe(1);
  });

  it('records nothing for an illegal move', () => {
    load(
      table({
        tableau: [[card(7, 'hearts')], [card(8, 'diamonds')], [], [], [], [], []],
      }),
    );
    useTableStore.getState().moveRun(0, 1, 0);
    expect(useTableStore.getState().moves).toBe(0);
    expect(useTableStore.getState().history).toHaveLength(0);
  });
});

describe('toFoundation through the store', () => {
  it('sends an ace up from a column', () => {
    load(table({ tableau: [[card(1, 'hearts')], [], [], [], [], [], []] }));
    useTableStore.getState().toFoundation({ from: 'tableau', column: 0 });
    expect(useTableStore.getState().game!.foundations.hearts).toHaveLength(1);
  });

  it('sends an ace up from the waste', () => {
    load(table({ waste: [card(1, 'spades')] }));
    useTableStore.getState().toFoundation({ from: 'waste' });
    expect(useTableStore.getState().game!.foundations.spades).toHaveLength(1);
  });

  it('records nothing when the card does not fit', () => {
    load(table({ waste: [card(9, 'spades')] }));
    useTableStore.getState().toFoundation({ from: 'waste' });
    expect(useTableStore.getState().moves).toBe(0);
  });
});

describe('wasteToTableau through the store', () => {
  it('drops the waste card onto a column that accepts it', () => {
    load(table({ waste: [card(6, 'hearts')], tableau: [[card(7, 'spades')], [], [], [], [], [], []] }));
    useTableStore.getState().wasteToTableau(0);
    expect(useTableStore.getState().game!.tableau[0]).toHaveLength(2);
    expect(useTableStore.getState().game!.waste).toHaveLength(0);
  });

  it('records nothing when it does not fit', () => {
    load(table({ waste: [card(6, 'hearts')], tableau: [[card(7, 'diamonds')], [], [], [], [], [], []] }));
    useTableStore.getState().wasteToTableau(0);
    expect(useTableStore.getState().moves).toBe(0);
  });
});

describe('recycle through the store', () => {
  it('turns the waste back into the stock once the stock is empty', () => {
    load(table({ stock: [], waste: [card(3, 'clubs'), card(4, 'hearts')] }));
    useTableStore.getState().recycle();
    expect(useTableStore.getState().game!.stock).toHaveLength(2);
    expect(useTableStore.getState().game!.waste).toHaveLength(0);
  });

  it('does nothing while the stock still has cards', () => {
    // Recycling early would let a player reorder the waste at will, which is a different game.
    load(table({ stock: [card(5, 'clubs', false)], waste: [card(3, 'clubs')] }));
    useTableStore.getState().recycle();
    expect(useTableStore.getState().moves).toBe(0);
  });
});

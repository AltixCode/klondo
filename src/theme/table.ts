/**
 * Table themes: the felt the cards sit on, and the back they are dealt face down with.
 *
 * In `src/theme/` because every colour literal in the app is. Each theme carries its own
 * card face and text colours rather than borrowing the app palette: a card is a physical
 * object with its own contrast requirements, and a red seven has to be legible on white
 * whatever the surrounding theme is doing.
 *
 * `default` is free. The other three are what the paywall means by "every card back and felt
 * theme". Every pairing is asserted at 4.5:1 by `__tests__/table.test.ts`.
 */

export interface TableTheme {
  /** The background the whole table sits on. */
  felt: string;
  /** A face-down card. */
  back: string;
  /** A face-up card. */
  face: string;
  /** Red suits on `face`. */
  red: string;
  /** Black suits on `face`. */
  black: string;
  /** An empty column or foundation slot. */
  slot: string;
  /**
   * The border of a selected card.
   *
   * Its own token rather than the app's `colors.accent`: `accent` is tuned against the app's
   * dark/light *background*, not a table theme's `face`, which is always a near-white card
   * regardless of system appearance. In dark mode `accent` is `#6EE7B7` -- a light mint -- and
   * against a white card face that measures ~1.5:1, well under the 3:1 a UI outline needs to
   * read as present at all. A tester called this out directly: "hard to distinguish". `highlight`
   * is picked per theme so a selected card is unmistakable against that theme's own face colour,
   * independent of which system appearance drew it.
   */
  highlight: string;
}

export const TABLE_THEMES: Record<string, TableTheme> = {
  default: {
    felt: "#0F5132",
    back: "#4B617F",
    face: "#FFFFFF",
    red: "#B3261E",
    black: "#1B1B1F",
    slot: "#0B3D26",
    highlight: "#1D4ED8",
  },
  slate: {
    felt: "#2B3440",
    back: "#3F4A5A",
    face: "#F8FAFC",
    red: "#B42318",
    black: "#0F172A",
    slot: "#232B35",
    highlight: "#1D4ED8",
  },
  wine: {
    felt: "#4A1220",
    back: "#71273A",
    face: "#FFF8F8",
    red: "#A4161A",
    black: "#1A1113",
    slot: "#3A0E19",
    highlight: "#1D4ED8",
  },
  sand: {
    felt: "#8A6D3B",
    back: "#6B5228",
    face: "#FFFDF5",
    red: "#A03A1E",
    black: "#2A2113",
    slot: "#705731",
    highlight: "#1D4ED8",
  },
};

export const TABLE_THEME_NAMES = Object.keys(TABLE_THEMES);

export function tableTheme(name: string): TableTheme {
  return TABLE_THEMES[name] ?? TABLE_THEMES.default!;
}

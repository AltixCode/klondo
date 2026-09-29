import { TABLE_THEMES, TABLE_THEME_NAMES, tableTheme } from "../table";
import { contrastRatio } from "../color";

describe("every table theme is legible", () => {
  for (const [name, theme] of Object.entries(TABLE_THEMES)) {
    // A card's rank and suit are the only information on it. A red seven that washes out
    // against the card face is unreadable, and it looks deliberate rather than broken.
    it(`${name}: red suits clear AA on the card face`, () => {
      expect(contrastRatio(theme.red, theme.face)).toBeGreaterThanOrEqual(4.5);
    });

    it(`${name}: black suits clear AA on the card face`, () => {
      expect(contrastRatio(theme.black, theme.face)).toBeGreaterThanOrEqual(
        4.5,
      );
    });

    it(`${name}: a card is distinguishable from the felt it sits on`, () => {
      expect(contrastRatio(theme.face, theme.felt)).toBeGreaterThanOrEqual(3);
      expect(contrastRatio(theme.back, theme.felt)).toBeGreaterThanOrEqual(1.4);
    });

    it(`${name}: an empty slot reads as empty, not as a card`, () => {
      expect(contrastRatio(theme.slot, theme.face)).toBeGreaterThanOrEqual(3);
    });

    // A selected card's border is the only signal a player gets that a tap registered. A
    // tester reported it blending into the card in dark mode -- the app's global accent
    // colour (a light mint, `#6EE7B7`) against a near-white card face is ~1.5:1. 3:1 is the
    // WCAG 2.1 1.4.11 floor for a UI component boundary, same threshold this suite already
    // uses for the empty-slot outline above.
    it(`${name}: a selected card's border clears the UI-component contrast floor`, () => {
      expect(contrastRatio(theme.highlight, theme.face)).toBeGreaterThanOrEqual(
        3,
      );
    });
  }
});

describe("tableTheme", () => {
  it("falls back to the default rather than throwing", () => {
    expect(tableTheme("paisley")).toEqual(TABLE_THEMES.default);
  });

  it("names every theme it holds", () => {
    expect(TABLE_THEME_NAMES).toHaveLength(Object.keys(TABLE_THEMES).length);
  });
});

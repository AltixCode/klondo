/**
 * A row the player cannot use yet must still be readable.
 *
 * It was drawn at `opacity: 0.6`, which put the label naming the reason at
 * roughly 2.0:1 -- the least legible element on the screen, and the only one
 * that explained the state.
 */
import { contrastRatio } from '../color';
import { gatedRow } from '../gatedRows';
import { darkPalette, lightPalette } from '../tokens';

describe.each([
  ['light', lightPalette],
  ['dark', darkPalette],
] as const)('%s gated rows', (_name, palette) => {
  const open = gatedRow(palette, true);
  const shut = gatedRow(palette, false);

  it('keeps the row text readable when the row is gated', () => {
    expect(contrastRatio(shut.text, shut.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the label readable — it is the reason the row is gated', () => {
    expect(contrastRatio(shut.label, shut.background)).toBeGreaterThanOrEqual(4.5);
  });

  it('separates the states by the label rather than by a wash', () => {
    // Not a threshold on the two fills: that proxy produced a run of false
    // contrast reports across this portfolio. The label is the real signal.
    expect(shut.label).not.toBe(open.label);
    expect(shut.background).not.toBe(open.background);
  });

  it('never returns a translucent row, which is what caused this', () => {
    expect(shut.opacity).toBe(1);
    expect(open.opacity).toBe(1);
  });
});

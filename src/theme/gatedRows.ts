/**
 * How a row the player cannot use yet is coloured.
 *
 * These rows were drawn at `opacity: 0.6`. Opacity composites the whole row --
 * text included -- toward the page behind it, so measured against this app's
 * own palette the row's label fell to about 2.0:1. That label is the word that
 * says WHY the row is unusable, so the least readable thing on the screen was
 * the thing the screen existed to explain. It reached an App Store screenshot
 * that way in a sibling app.
 *
 * Dimming is the signal for a DISABLED control. These rows are not disabled --
 * every one of them is tappable, and the code comment that sat above the
 * opacity line said so -- so they are information, and information meets AA.
 *
 * The unusable state is carried by a distinct surface and a full-contrast
 * accent label instead of a wash.
 */
import { contrastRatio } from './color';
import type { Palette } from './tokens';

export interface GatedRowColors {
  background: string;
  text: string;
  /** The label naming the reason. Verified >= 4.5:1 against `background`. */
  label: string;
  /** Always 1, kept explicit so an edit cannot quietly reintroduce the wash. */
  opacity: 1;
}

export function gatedRow(palette: Palette, available: boolean): GatedRowColors {
  const background = available ? palette.surface : palette.surfaceAlt;
  return {
    background,
    text: palette.text,
    // The accent where it is readable on this surface, and the primary text
    // colour where it is not. One app's light accent measures 4.41:1 here --
    // close enough to look fine and still below AA -- and hard-coding the
    // accent would have shipped it. Checked rather than assumed, because the
    // palettes differ per app and this helper is the same in all of them.
    label: available
      ? palette.textMuted
      : contrastRatio(palette.accent, background) >= 4.5
        ? palette.accent
        : palette.text,
    opacity: 1,
  };
}

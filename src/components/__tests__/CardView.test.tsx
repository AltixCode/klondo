import React from 'react';

import { CardView, rankLabel, suitGlyph } from '../CardView';
import { renderWithProviders } from './renderWithProviders';
import { tableTheme } from '@/theme/table';

const felt = tableTheme('default');

describe('rankLabel', () => {
  it('names the court cards and the ace rather than printing their numbers', () => {
    expect(rankLabel(1)).toBe('A');
    expect(rankLabel(11)).toBe('J');
    expect(rankLabel(12)).toBe('Q');
    expect(rankLabel(13)).toBe('K');
    expect(rankLabel(7)).toBe('7');
  });

  it('falls back to the number for a rank it does not know', () => {
    expect(rankLabel(99)).toBe('99');
  });
});

describe('suitGlyph', () => {
  it('has a glyph for each suit', () => {
    expect(suitGlyph('hearts')).toBe('♥');
    expect(suitGlyph('spades')).toBe('♠');
  });

  it('is empty for something that is not a suit', () => {
    expect(suitGlyph('rocks')).toBe('');
  });
});

describe('CardView', () => {
  it('shows the rank and suit of a face-up card', async () => {
    const { getByText } = await renderWithProviders(
      <CardView card={{ rank: 12, suit: 'hearts', faceUp: true }} theme={felt} width={40} height={56} />,
    );
    expect(getByText('Q♥')).toBeTruthy();
  });

  it('shows nothing readable on a face-down card', async () => {
    // The whole point of a face-down card is that its value is not available.
    const { queryByText } = await renderWithProviders(
      <CardView card={{ rank: 12, suit: 'hearts', faceUp: false }} theme={felt} width={40} height={56} />,
    );
    expect(queryByText('Q♥')).toBeNull();
  });

  it('renders an empty slot without a card', async () => {
    const { toJSON } = await renderWithProviders(
      <CardView card={null} theme={felt} width={40} height={56} slot />,
    );
    expect(toJSON()).toBeTruthy();
  });

  it('renders nothing visible for a gap that is not a slot', async () => {
    const { toJSON } = await renderWithProviders(
      <CardView card={null} theme={felt} width={40} height={56} />,
    );
    expect(toJSON()).toBeTruthy();
  });
});

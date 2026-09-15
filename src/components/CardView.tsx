import React from "react";
import { View } from "react-native";

import { Text } from "@/components/ui";
import { type Card, colourOf } from "@/logic/klondike";
import { type TableTheme } from "@/theme/table";
import { useTheme } from "@/theme";

/** Ace through king. Index 0 is unused so a rank indexes directly. */
const RANK_LABELS = [
  "",
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];
const SUIT_GLYPHS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export const rankLabel = (rank: number): string =>
  RANK_LABELS[rank] ?? String(rank);
export const suitGlyph = (suit: string): string => SUIT_GLYPHS[suit] ?? "";

interface CardViewProps {
  card: Card | null;
  theme: TableTheme;
  width: number;
  height: number;
  selected?: boolean;
  /** Renders an empty slot outline when there is no card. */
  slot?: boolean;
}

/**
 * One card, or an empty slot.
 *
 * The rank and glyph sit in the top-left only. A full mirrored corner looks more like a real
 * card but at phone size the two corners collide in the overlap between stacked cards, and
 * the top-left is the one that stays visible when cards are fanned down a column.
 */
export function CardView({
  card,
  theme,
  width,
  height,
  selected,
  slot,
}: CardViewProps) {
  const { radius, colors } = useTheme();

  if (!card) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius: radius.sm,
          backgroundColor: slot ? theme.slot : "transparent",
          borderWidth: slot ? 1 : 0,
          borderColor: theme.face,
          opacity: slot ? 0.5 : 0,
        }}
      />
    );
  }

  if (!card.faceUp) {
    return (
      <View
        style={{
          width,
          height,
          borderRadius: radius.sm,
          backgroundColor: theme.back,
          borderWidth: 1,
          borderColor: theme.slot,
        }}
      />
    );
  }

  const ink = colourOf(card.suit) === "red" ? theme.red : theme.black;
  return (
    <View
      style={{
        width,
        height,
        borderRadius: radius.sm,
        backgroundColor: theme.face,
        borderWidth: selected ? 3 : 1,
        borderColor: selected ? colors.accent : theme.slot,
        paddingHorizontal: 4,
        paddingTop: 2,
      }}
    >
      <Text
        variant="caption"
        color={ink}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {`${rankLabel(card.rank)}${suitGlyph(card.suit)}`}
      </Text>
    </View>
  );
}

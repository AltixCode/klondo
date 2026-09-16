import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";

import { BannerAdSlot } from "@/components/BannerAdSlot";
import { CardView, rankLabel } from "@/components/CardView";
import { Button, Screen, Text } from "@/components/ui";
import { t, type TranslationKey } from "@/i18n";
import { SUITS, type Card, type Suit, hasWon } from "@/logic/klondike";
import { dateKey } from "@/logic/daily";
import { FREE_HINTS, FREE_UNDO, useTableStore } from "@/store/useTableStore";
import { usePremiumStore } from "@/store/usePremiumStore";
import { tableTheme } from "@/theme/table";
import { useTheme } from "@/theme";

const SUIT_KEY: Record<Suit, TranslationKey> = {
  hearts: "suitHearts",
  diamonds: "suitDiamonds",
  clubs: "suitClubs",
  spades: "suitSpades",
};

/** What a card is called out loud. */
const describe = (card: Card | undefined): string =>
  !card
    ? ""
    : card.faceUp
      ? `${rankLabel(card.rank)} ${t(SUIT_KEY[card.suit])}`
      : t("faceDownCard");

type Selection =
  { kind: "waste" } | { kind: "tableau"; column: number; index: number } | null;

export default function Table() {
  const router = useRouter();
  const { colors, spacing, radius } = useTheme();
  const { width } = useWindowDimensions();

  const isPremium = usePremiumStore((s) => s.isPremium);
  const game = useTableStore((s) => s.game);
  const themeName = useTableStore((s) => s.theme);
  const moves = useTableStore((s) => s.moves);
  const undosUsed = useTableStore((s) => s.undosUsed);
  const hintsUsed = useTableStore((s) => s.hintsUsed);
  const startDay = useTableStore((s) => s.startDay);
  const draw = useTableStore((s) => s.draw);
  const recycle = useTableStore((s) => s.recycle);
  const moveRun = useTableStore((s) => s.moveRun);
  const toFoundation = useTableStore((s) => s.toFoundation);
  const wasteToTableau = useTableStore((s) => s.wasteToTableau);
  const undo = useTableStore((s) => s.undo);
  const hint = useTableStore((s) => s.hint);

  const [selected, setSelected] = useState<Selection>(null);
  const announced = useRef(false);
  const today = useMemo(() => new Date(), []);
  const felt = tableTheme(themeName);

  // Seven columns plus gutters. The card height is the usual 1.4 ratio.
  const cardW = Math.floor(
    (Math.min(width, 520) - spacing.xl * 2 - spacing.xs * 6) / 7,
  );
  const cardH = Math.round(cardW * 1.4);
  const fan = Math.round(cardH * 0.28);

  useEffect(() => {
    if (!game) startDay(dateKey(today), today, isPremium);
  }, [game, startDay, today, isPremium]);

  useEffect(() => {
    if (!game || announced.current || !hasWon(game)) return;
    announced.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t("wonTitle"), t("wonBody", { moves: String(moves) }));
  }, [game, moves]);

  const offerUnlock = useCallback(() => {
    Alert.alert(t("limitTitle"), t("unlockBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("removeAdsCta"), onPress: () => router.push("/paywall") },
    ]);
  }, [router]);

  const tapColumn = useCallback(
    (column: number, index: number) => {
      if (!game) return;
      const cards = game.tableau[column] ?? [];
      // Second tap: this column is the destination.
      if (selected) {
        if (selected.kind === "waste") wasteToTableau(column);
        else if (selected.column !== column)
          moveRun(selected.column, column, selected.index);
        setSelected(null);
        void Haptics.selectionAsync();
        return;
      }
      const card = cards[index];
      if (!card?.faceUp) return;
      setSelected({ kind: "tableau", column, index });
    },
    [game, selected, moveRun, wasteToTableau],
  );

  const doUndo = useCallback(() => {
    const outcome = undo(isPremium);
    if (outcome === "nothing-to-undo") Alert.alert(t("nothingToUndo"));
    else if (outcome === "limit-reached") offerUnlock();
    else {
      announced.current = false;
      setSelected(null);
    }
  }, [undo, isPremium, offerUnlock]);

  const doHint = useCallback(() => {
    const outcome = hint(isPremium);
    if (outcome === "limit-reached") offerUnlock();
    else if (outcome === "none-available")
      Alert.alert(t("noMoveTitle"), t("noMoveBody"));
  }, [hint, isPremium, offerUnlock]);

  if (!game) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        {/* topInset, because this route sets headerShown:false -- with no
          navigation header above it, nothing else pays the notch, and the
          title renders underneath the status bar. */}
      <Screen topInset>
          <Text variant="display">{t("appName")}</Text>
        </Screen>
        <BannerAdSlot />
      </View>
    );
  }

  const wasteTop = game.waste.at(-1);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Screen scroll>
        <View style={styles.titleRow}>
          <View style={{ flex: 1 }}>
            <Text variant="display">{t("appName")}</Text>
            <Text variant="caption" tone="muted">
              {t("movesLabel", { n: String(moves) })}
            </Text>
          </View>
          <Button
            label={t("archiveTitle")}
            variant="ghost"
            onPress={() => router.push("/archive")}
          />
        </View>

        <View
          style={{
            marginTop: spacing.md,
            padding: spacing.sm,
            borderRadius: radius.lg,
            backgroundColor: felt.felt,
          }}
        >
          <View style={[styles.row, { gap: spacing.xs }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                game.stock.length > 0
                  ? t("stockLabel", { n: String(game.stock.length) })
                  : t("stockEmpty")
              }
              onPress={() => (game.stock.length > 0 ? draw(1) : recycle())}
            >
              <CardView
                card={game.stock.at(-1) ?? null}
                theme={felt}
                width={cardW}
                height={cardH}
                slot
              />
            </Pressable>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                wasteTop
                  ? t("wasteLabel", { card: describe(wasteTop) })
                  : t("wasteEmpty")
              }
              onPress={() => wasteTop && setSelected({ kind: "waste" })}
            >
              <CardView
                card={wasteTop ?? null}
                theme={felt}
                width={cardW}
                height={cardH}
                selected={selected?.kind === "waste"}
                slot
              />
            </Pressable>

            <View style={{ width: cardW * 0.4 }} />

            {SUITS.map((suit) => {
              const pile = game.foundations[suit];
              const top = pile.at(-1);
              return (
                <Pressable
                  key={suit}
                  accessibilityRole="button"
                  accessibilityLabel={
                    top
                      ? t("foundationLabel", {
                          suit: t(SUIT_KEY[suit]),
                          card: describe(top),
                        })
                      : t("foundationEmpty", { suit: t(SUIT_KEY[suit]) })
                  }
                  onPress={() => {
                    if (!selected) return;
                    toFoundation(
                      selected.kind === "waste"
                        ? { from: "waste" }
                        : { from: "tableau", column: selected.column },
                    );
                    setSelected(null);
                  }}
                >
                  <CardView
                    card={top ?? null}
                    theme={felt}
                    width={cardW}
                    height={cardH}
                    slot
                  />
                </Pressable>
              );
            })}
          </View>

          <View
            style={[
              styles.row,
              {
                gap: spacing.xs,
                marginTop: spacing.md,
                alignItems: "flex-start",
              },
            ]}
          >
            {game.tableau.map((column, columnIndex) => (
              <View
                key={columnIndex}
                style={{
                  width: cardW,
                  minHeight: cardH + fan * Math.max(0, column.length - 1),
                }}
              >
                {column.length === 0 ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("columnEmpty", {
                      n: String(columnIndex + 1),
                    })}
                    onPress={() => tapColumn(columnIndex, 0)}
                  >
                    <CardView
                      card={null}
                      theme={felt}
                      width={cardW}
                      height={cardH}
                      slot
                    />
                  </Pressable>
                ) : (
                  column.map((card, cardIndex) => (
                    <Pressable
                      key={cardIndex}
                      accessibilityRole="button"
                      accessibilityLabel={t("columnLabel", {
                        n: String(columnIndex + 1),
                        card: describe(card),
                      })}
                      onPress={() => tapColumn(columnIndex, cardIndex)}
                      style={{
                        marginTop: cardIndex === 0 ? 0 : -(cardH - fan),
                      }}
                    >
                      <CardView
                        card={card}
                        theme={felt}
                        width={cardW}
                        height={cardH}
                        selected={
                          selected?.kind === "tableau" &&
                          selected.column === columnIndex &&
                          cardIndex >= selected.index
                        }
                      />
                    </Pressable>
                  ))
                )}
              </View>
            ))}
          </View>
        </View>

        <Text variant="micro" tone="faint" style={{ marginTop: spacing.sm }}>
          {t("selectHint")}
        </Text>

        <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.md }]}>
          <Button
            label={t("drawCta")}
            variant="secondary"
            onPress={() => draw(1)}
            style={{ flex: 1 }}
          />
          <Button
            label={
              isPremium
                ? t("undoCta")
                : t("undoLeft", {
                    n: String(Math.max(0, FREE_UNDO - undosUsed)),
                  })
            }
            variant="secondary"
            onPress={doUndo}
            style={{ flex: 1 }}
          />
          <Button
            label={
              isPremium
                ? t("hintCta")
                : t("hintLeft", {
                    n: String(Math.max(0, FREE_HINTS - hintsUsed)),
                  })
            }
            variant="secondary"
            onPress={doHint}
            style={{ flex: 1 }}
          />
        </View>

        <Button
          label={t("settingsTitle")}
          variant="ghost"
          fullWidth
          onPress={() => router.push("/settings")}
          style={{ marginTop: spacing.md }}
        />
      </Screen>
      <BannerAdSlot />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center" },
});

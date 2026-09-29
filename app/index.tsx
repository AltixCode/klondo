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
import {
  SUITS,
  type Card,
  type Suit,
  canAutoComplete,
  canStackOnFoundation,
  hasWon,
  nextAutoCompleteAction,
} from "@/logic/klondike";
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
  //
  // The cap lifts on a tablet for the same reason Worddrop's keyboard cap did:
  // at a flat `Math.min(width, 520)` the tableau draws at its phone size on a
  // 1032pt iPad, so seven 61pt cards sit in the middle of a 13" screen with
  // half the width unused. Points are density independent -- the cards were
  // never shrinking, the screen around them was growing.
  const isTablet = width >= 700;
  const cardW = Math.floor(
    (Math.min(width, isTablet ? 820 : 520) - spacing.xl * 2 - spacing.xs * 6) /
      7,
  );
  const cardH = Math.round(cardW * 1.4);
  const fan = Math.round(cardH * 0.28);

  useEffect(() => {
    if (!game) startDay(dateKey(today), today, isPremium);
  }, [game, startDay, today, isPremium]);

  const doNewGame = useCallback(() => {
    announced.current = false;
    setSelected(null);
    startDay(dateKey(new Date()), new Date(), isPremium);
  }, [startDay, isPremium]);

  useEffect(() => {
    if (!game || announced.current || !hasWon(game)) return;
    announced.current = true;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert(t("wonTitle"), t("wonBody", { moves: String(moves) }), [
      {
        text: t("playAgainCta"),
        onPress: doNewGame,
      },
    ]);
  }, [game, moves, doNewGame]);

  const [autoCompleting, setAutoCompleting] = useState(false);
  const autoCompleteStepsRef = useRef(0);

  // Once every tableau card is face up there is nothing left to *decide* -- only cards left to
  // walk to a foundation one at a time. That is exactly what a tester objected to: "instead of
  // having to sort them one by one". `canAutoComplete` is the same "only foundation moves
  // remain" condition every solitaire app uses to offer a one-tap finish.
  const canFinish = !!game && !autoCompleting && canAutoComplete(game);

  const doAutoComplete = useCallback(() => {
    if (!canFinish) return;
    autoCompleteStepsRef.current = 0;
    setSelected(null);
    setAutoCompleting(true);
  }, [canFinish]);

  // Plays out an automatic finish one action at a time, re-reading the store on every tick so
  // it always acts on the latest state rather than a stale closure over `game`. The 80ms cadence
  // matches the single-column auto-play this replaces, and the step ceiling is a defensive
  // guard against a state `nextAutoCompleteAction` failed to reason about, not a tuned bound --
  // a real deal finishes in well under it.
  useEffect(() => {
    if (!autoCompleting) return;
    // Everything -- including the calls that stop the animation -- happens inside the timer
    // callback, never synchronously in the effect body: a `setState` there would cascade
    // straight into another render instead of giving the screen a frame to show the last move.
    const timer = setTimeout(() => {
      const current = useTableStore.getState().game;
      if (!current || autoCompleteStepsRef.current > 300) {
        setAutoCompleting(false);
        return;
      }
      const action = nextAutoCompleteAction(current);
      if (!action) {
        setAutoCompleting(false);
        return;
      }
      autoCompleteStepsRef.current += 1;
      if (action.type === "foundation") toFoundation(action.source);
      else if (action.type === "draw") draw(1);
      else if (action.type === "recycle") recycle();
      else {
        const fromIndex = current.tableau[action.from]!.length - 1;
        moveRun(action.from, action.to, fromIndex);
      }
    }, 80);
    return () => clearTimeout(timer);
  }, [autoCompleting, game, toFoundation, draw, recycle, moveRun]);

  const offerUnlock = useCallback(() => {
    Alert.alert(t("limitTitle"), t("unlockBody"), [
      { text: t("cancel"), style: "cancel" },
      { text: t("removeAdsCta"), onPress: () => router.push("/paywall") },
    ]);
  }, [router]);

  const lastTapRef = useRef<{ time: number; key: string }>({
    time: 0,
    key: "",
  });

  const tryAutoMoveToFoundation = useCallback(
    (source: { from: "waste" } | { from: "tableau"; column: number }) => {
      if (!game) return false;
      const card =
        source.from === "waste"
          ? game.waste.at(-1)
          : game.tableau[source.column]?.at(-1);
      if (!card || !card.faceUp) return false;
      if (canStackOnFoundation(card, game.foundations[card.suit])) {
        toFoundation(source);
        setSelected(null);
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        return true;
      }
      return false;
    },
    [game, toFoundation],
  );

  const tapColumn = useCallback(
    (column: number, index: number) => {
      if (!game) return;
      const cards = game.tableau[column] ?? [];
      const card = cards[index];

      // Second tap: this column is the destination.
      if (selected) {
        if (selected.kind === "waste") {
          wasteToTableau(column);
          setSelected(null);
          void Haptics.selectionAsync();
          return;
        }
        if (selected.column !== column) {
          moveRun(selected.column, column, selected.index);
          setSelected(null);
          void Haptics.selectionAsync();
          return;
        }
        // Same column and index: tap again on selected top card sends to foundation if valid!
        if (selected.index === index && index === cards.length - 1) {
          if (tryAutoMoveToFoundation({ from: "tableau", column })) {
            return;
          }
        }
        setSelected(null);
        return;
      }

      if (!card?.faceUp) return;

      // A double tap on the top card sends it straight to its foundation when that fits --
      // every rank behaves the same way here, aces included. A single tap always selects, so
      // the gesture is consistent no matter what card is under the finger: a tester flagged
      // aces as the one card that moved on a single tap while everything else needed two.
      if (index === cards.length - 1) {
        const now = Date.now();
        const key = `col:${column}:${index}`;
        const isDoubleTap =
          now - lastTapRef.current.time < 350 && lastTapRef.current.key === key;
        lastTapRef.current = { time: now, key };
        if (isDoubleTap) {
          if (tryAutoMoveToFoundation({ from: "tableau", column })) {
            return;
          }
        }
      }

      setSelected({ kind: "tableau", column, index });
    },
    [game, selected, moveRun, wasteToTableau, tryAutoMoveToFoundation],
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
      {/* topInset here too, not only on the loading branch above.
          This route sets headerShown:false, so nothing pays the notch. The
          inset was added to the `if (!game)` branch -- a screen that shows for
          a fraction of a second -- and not to the game itself, which is the
          one anybody sees. Klondo's live App Store screenshot has "Klondo /
          1 moves" sliced in half by the status bar because of it. */}
      <Screen scroll topInset>
        <View style={[styles.titleRow, { marginTop: spacing.xs }]}>
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
              onPress={() => {
                if (!wasteTop) return;
                const now = Date.now();
                const key = "waste";
                const isDoubleTap =
                  now - lastTapRef.current.time < 350 &&
                  lastTapRef.current.key === key;
                lastTapRef.current = { time: now, key };
                if (isDoubleTap) {
                  if (tryAutoMoveToFoundation({ from: "waste" })) {
                    return;
                  }
                }
                setSelected({ kind: "waste" });
              }}
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
                    const selectedCard =
                      selected.kind === "waste"
                        ? game.waste.at(-1)
                        : game.tableau[selected.column]?.at(selected.index);
                    if (selectedCard && selectedCard.suit === suit) {
                      toFoundation(
                        selected.kind === "waste"
                          ? { from: "waste" }
                          : { from: "tableau", column: selected.column },
                      );
                      void Haptics.impactAsync(
                        Haptics.ImpactFeedbackStyle.Light,
                      );
                    }
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

        {canFinish ? (
          <Button
            label={t("autoCompleteCta")}
            variant="primary"
            onPress={doAutoComplete}
            fullWidth
            style={{ marginTop: spacing.md }}
          />
        ) : null}

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

        <View style={[styles.row, { gap: spacing.sm, marginTop: spacing.md }]}>
          <Button
            label={t("playAgainCta")}
            variant="secondary"
            onPress={doNewGame}
            style={{ flex: 1 }}
          />
          <Button
            label={t("settingsTitle")}
            variant="ghost"
            onPress={() => router.push("/settings")}
            style={{ flex: 1 }}
          />
        </View>
      </Screen>
      <BannerAdSlot />
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center" },
  row: { flexDirection: "row", alignItems: "center" },
});

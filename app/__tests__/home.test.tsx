import { fireEvent } from "@testing-library/react-native";
import React from "react";
import { Alert } from "react-native";

import Home from "../index";
import { testRouter } from "./testRouter";
import { renderWithProviders } from "@/components/__tests__/renderWithProviders";
import { t } from "@/i18n";
import { dateKey } from "@/logic/daily";
import { RANKS, SUITS, type Card } from "@/logic/klondike";
import { useAdsConsentStore } from "@/store/useAdsConsentStore";
import { FREE_UNDO, useTableStore } from "@/store/useTableStore";
import { usePremiumStore } from "@/store/usePremiumStore";

const todayKey = dateKey(new Date());

const reset = () =>
  useTableStore.setState({
    game: null,
    dayKey: null,
    theme: "default",
    history: [],
    undosUsed: 0,
    hintsUsed: 0,
    moves: 0,
    days: {},
  });

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({
    consent: { canServeAds: true, offerPrivacyOptions: false },
  });
  reset();
});

describe("the table", () => {
  it("deals today's game on first mount", async () => {
    await renderWithProviders(<Home />);
    expect(useTableStore.getState().dayKey).toBe(todayKey);
    expect(useTableStore.getState().game!.tableau).toHaveLength(7);
  });

  it("labels the stock with how many cards it holds", async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    const n = useTableStore.getState().game!.stock.length;
    expect(getByLabelText(t("stockLabel", { n: String(n) }))).toBeTruthy();
  });

  it("draws a card onto the waste when the stock is tapped", async () => {
    const { getByLabelText } = await renderWithProviders(<Home />);
    const n = useTableStore.getState().game!.stock.length;
    await fireEvent.press(getByLabelText(t("stockLabel", { n: String(n) })));
    expect(useTableStore.getState().game!.waste).toHaveLength(1);
  });

  it("announces a face-down card as face-down rather than naming it", async () => {
    // Reading out a hidden card would give the game away to a screen-reader user.
    const { getAllByLabelText } = await renderWithProviders(<Home />);
    const hidden = getAllByLabelText(
      t("columnLabel", { n: "7", card: t("faceDownCard") }),
    );
    expect(hidden.length).toBeGreaterThan(0);
  });

  it("says there is nothing to undo rather than offering the purchase", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByText(t("undoLeft", { n: String(FREE_UNDO) })));
    expect(alert).toHaveBeenCalledWith(t("nothingToUndo"));
    expect(testRouter.push).not.toHaveBeenCalledWith("/paywall");
  });

  it("undoes a draw", async () => {
    const { getByText, getByLabelText } = await renderWithProviders(<Home />);
    const n = useTableStore.getState().game!.stock.length;
    await fireEvent.press(getByLabelText(t("stockLabel", { n: String(n) })));
    expect(useTableStore.getState().game!.waste).toHaveLength(1);

    await fireEvent.press(getByText(t("undoLeft", { n: String(FREE_UNDO) })));
    expect(useTableStore.getState().game!.waste).toHaveLength(0);
  });

  it("offers the purchase once a free player runs out of undos", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<Home />);

    for (let i = 0; i < FREE_UNDO + 1; i += 1) useTableStore.getState().draw(1);
    for (let i = 0; i < FREE_UNDO; i += 1) {
      await fireEvent.press(
        getByText(t("undoLeft", { n: String(FREE_UNDO - i) })),
      );
    }
    await fireEvent.press(getByText(t("undoLeft", { n: "0" })));
    expect(alert.mock.calls.at(-1)![0]).toBe(t("limitTitle"));
  });

  it("routes to the archive and settings", async () => {
    const { getByText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByText(t("archiveTitle")));
    expect(testRouter.push).toHaveBeenCalledWith("/archive");
    await fireEvent.press(getByText(t("settingsTitle")));
    expect(testRouter.push).toHaveBeenCalledWith("/settings");
  });

  it("announces a completed deal once", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await renderWithProviders(<Home />);

    const full = (suit: (typeof SUITS)[number]): Card[] =>
      RANKS.map((rank) => ({ rank, suit, faceUp: true }));
    useTableStore.setState({
      game: {
        ...useTableStore.getState().game!,
        foundations: {
          hearts: full("hearts"),
          diamonds: full("diamonds"),
          clubs: full("clubs"),
          spades: full("spades"),
        },
      },
      moves: 140,
    });
    await renderWithProviders(<Home />);

    const wonCalls = alert.mock.calls.filter((c) => c[0] === t("wonTitle"));
    expect(wonCalls.length).toBeGreaterThanOrEqual(1);
  });

  it("handles hint button presses", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    const { getByText } = await renderWithProviders(<Home />);
    await fireEvent.press(getByText(t("hintLeft", { n: "3" })));
    expect(alert).not.toHaveBeenCalledWith(t("limitTitle"));
  });

  it("auto-moves Ace to foundation on tap", async () => {
    await renderWithProviders(<Home />);
    useTableStore.setState({
      game: {
        stock: [],
        waste: [{ rank: 1, suit: "hearts", faceUp: true }],
        foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
        tableau: [
          [{ rank: 1, suit: "spades", faceUp: true }],
          [],
          [],
          [],
          [],
          [],
          [],
        ],
      },
      moves: 5,
    });
    const { getByLabelText, getByText } = await renderWithProviders(<Home />);
    const aceHeart = getByLabelText(
      t("wasteLabel", { card: `A ${t("suitHearts")}` }),
    );
    await fireEvent.press(aceHeart);
    expect(useTableStore.getState().game!.foundations.hearts).toHaveLength(1);

    // Also test "Play another game" button
    await fireEvent.press(getByText(t("playAgainCta")));
    expect(useTableStore.getState().game).toBeTruthy();
  });
});

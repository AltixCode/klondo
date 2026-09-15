import { fireEvent } from "@testing-library/react-native";
import React from "react";

import Archive from "../archive";
import { testRouter } from "./testRouter";
import { renderWithProviders } from "@/components/__tests__/renderWithProviders";
import { t } from "@/i18n";
import { dateKey } from "@/logic/daily";
import { useAdsConsentStore } from "@/store/useAdsConsentStore";
import { useTableStore } from "@/store/useTableStore";
import { usePremiumStore } from "@/store/usePremiumStore";

const todayKey = dateKey(new Date());
const yesterdayKey = dateKey(new Date(Date.now() - 86_400_000));

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({
    consent: { canServeAds: true, offerPrivacyOptions: false },
  });
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
});

describe("the archive", () => {
  it("marks today", async () => {
    const { getByText } = await renderWithProviders(<Archive />);
    expect(getByText(t("todayLabel"))).toBeTruthy();
  });

  it("lets a free player open today", async () => {
    const { getByLabelText } = await renderWithProviders(<Archive />);
    await fireEvent.press(getByLabelText(t("playDay", { date: todayKey })));
    expect(useTableStore.getState().dayKey).toBe(todayKey);
    expect(testRouter.back).toHaveBeenCalled();
  });

  it("sends a free player tapping a past day to the paywall, loading nothing", async () => {
    const { getByLabelText } = await renderWithProviders(<Archive />);
    await fireEvent.press(
      getByLabelText(t("dayLocked", { date: yesterdayKey })),
    );
    expect(testRouter.push).toHaveBeenCalledWith("/paywall");
    expect(useTableStore.getState().dayKey).toBeNull();
  });

  it("opens a past day for a paying player", async () => {
    usePremiumStore.setState({ isPremium: true });
    const { getByLabelText } = await renderWithProviders(<Archive />);
    await fireEvent.press(getByLabelText(t("playDay", { date: yesterdayKey })));
    expect(useTableStore.getState().dayKey).toBe(yesterdayKey);
  });

  it("shows a won day with its move count", async () => {
    useTableStore.setState({ days: { [todayKey]: { won: true, moves: 137 } } });
    const { getByLabelText } = await renderWithProviders(<Archive />);
    expect(
      getByLabelText(t("dayWon", { date: todayKey, moves: "137" })),
    ).toBeTruthy();
  });
});

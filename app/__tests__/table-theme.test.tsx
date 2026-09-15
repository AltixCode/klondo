import { fireEvent } from '@testing-library/react-native';
import React from 'react';

import Settings from '../settings';
import { testRouter } from './testRouter';
import { renderWithProviders } from '@/components/__tests__/renderWithProviders';
import { t } from '@/i18n';
import { useAdsConsentStore } from '@/store/useAdsConsentStore';
import { useTableStore } from '@/store/useTableStore';
import { usePremiumStore } from '@/store/usePremiumStore';

beforeEach(() => {
  jest.clearAllMocks();
  usePremiumStore.setState({ isPremium: false, isReady: true });
  useAdsConsentStore.setState({ consent: { canServeAds: true, offerPrivacyOptions: false } });
  useTableStore.setState({
    game: null,
    dayKey: null,
    theme: 'default',
    history: [],
    undosUsed: 0,
    hintsUsed: 0,
    moves: 0,
    days: {},
  });
});

describe('the table theme picker', () => {
  it('shows every theme, including the locked ones', async () => {
    // Hiding what the purchase buys means nobody knows it exists.
    const { getByLabelText } = await renderWithProviders(<Settings />);
    expect(getByLabelText(t('themeDefault'))).toBeTruthy();
    expect(getByLabelText(`${t('themeWine')} — ${t('lockedTitle')}`)).toBeTruthy();
  });

  it('sends a free player tapping a locked theme to the paywall, changing nothing', async () => {
    const { getByLabelText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByLabelText(`${t('themeSlate')} — ${t('lockedTitle')}`));
    expect(testRouter.push).toHaveBeenCalledWith('/paywall');
    expect(useTableStore.getState().theme).toBe('default');
  });

  it('lets a paying player choose one', async () => {
    usePremiumStore.setState({ isPremium: true });
    const { getByLabelText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByLabelText(t('themeWine')));
    expect(useTableStore.getState().theme).toBe('wine');
  });

  it('lets anyone pick the free theme back', async () => {
    usePremiumStore.setState({ isPremium: true });
    useTableStore.setState({ theme: 'wine' });
    const { getByLabelText } = await renderWithProviders(<Settings />);
    await fireEvent.press(getByLabelText(t('themeDefault')));
    expect(useTableStore.getState().theme).toBe('default');
  });
});

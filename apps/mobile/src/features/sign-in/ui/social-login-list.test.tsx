import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { socialProviders } from '../model/social-provider';
import { SocialLoginList } from './social-login-list';

const mockSetSession = jest.fn();

jest.mock('@/entities/session', () => ({
  useSetSession: () => mockSetSession,
}));

jest.mock('@/shared/lib/supabase', () => ({
  isSupabaseConfigured: true,
}));

jest.mock('../model/supabase-auth-provider', () => ({
  SignInCancelledError: class extends Error {},
  supabaseAuthProvider: {
    signIn: async (provider: string) => ({
      id: `user-${provider}`,
      displayName: 'Test User',
      provider,
    }),
  },
}));

describe('SocialLoginList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders a button for every supported provider', async () => {
    await render(<SocialLoginList />);

    for (const provider of socialProviders) {
      expect(screen.getByRole('button', { name: provider.label })).toBeTruthy();
    }
  });

  it('signs in with the pressed provider', async () => {
    const google = socialProviders.find((provider) => provider.id === 'google')!;
    await render(<SocialLoginList />);

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: google.label }));
    });

    await waitFor(() =>
      expect(mockSetSession).toHaveBeenCalledWith(expect.objectContaining({ provider: 'google' })),
    );
  });
});

import type { User as SupabaseUser } from '@supabase/supabase-js';

import { mapSupabaseUser } from './map-user';

function supabaseUser(overrides: Partial<SupabaseUser>): SupabaseUser {
  return {
    id: 'user-1',
    app_metadata: { provider: 'google' },
    user_metadata: {},
    aud: 'authenticated',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as SupabaseUser;
}

describe('mapSupabaseUser', () => {
  it('maps id, provider, and Google display name and avatar', () => {
    const user = mapSupabaseUser(
      supabaseUser({
        app_metadata: { provider: 'google' },
        user_metadata: { full_name: 'Young Hong', avatar_url: 'https://cdn/a.png' },
      }),
    );

    expect(user).toEqual({
      id: 'user-1',
      provider: 'google',
      displayName: 'Young Hong',
      avatarUrl: 'https://cdn/a.png',
    });
  });

  it('reads the apple provider and its picture/name fields', () => {
    const user = mapSupabaseUser(
      supabaseUser({
        app_metadata: { provider: 'apple' },
        user_metadata: { name: 'Apple User', picture: 'https://cdn/apple.png' },
      }),
    );

    expect(user.provider).toBe('apple');
    expect(user.displayName).toBe('Apple User');
    expect(user.avatarUrl).toBe('https://cdn/apple.png');
  });

  it('falls back to email then a default when no name is present', () => {
    const withEmail = mapSupabaseUser(supabaseUser({ email: 'me@example.com', user_metadata: {} }));
    expect(withEmail.displayName).toBe('me@example.com');

    const withNothing = mapSupabaseUser(supabaseUser({ email: undefined, user_metadata: {} }));
    expect(withNothing.displayName.length).toBeGreaterThan(0);
    expect(withNothing.avatarUrl).toBeUndefined();
  });

  it('reads the email provider for password accounts', () => {
    const user = mapSupabaseUser(
      supabaseUser({ app_metadata: { provider: 'email' }, email: 'me@example.com' }),
    );
    expect(user.provider).toBe('email');
    expect(user.displayName).toBe('me@example.com');
  });

  it('defaults an unknown provider to google', () => {
    const user = mapSupabaseUser(supabaseUser({ app_metadata: { provider: 'facebook' } }));
    expect(user.provider).toBe('google');
  });
});

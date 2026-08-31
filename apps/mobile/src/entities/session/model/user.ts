/** Supported social identity providers a session can be created from. */
export type SocialProvider = 'google' | 'apple';

/**
 * How the current session was authenticated: a social provider or an
 * email/password account. `SocialProvider` stays narrow for the social sign-in
 * button metadata; `AuthMethod` is the broader set a `User` can carry.
 */
export type AuthMethod = SocialProvider | 'email';

/** The authenticated account the application currently acts on behalf of. */
export type User = {
  id: string;
  displayName: string;
  provider: AuthMethod;
  avatarUrl?: string;
};

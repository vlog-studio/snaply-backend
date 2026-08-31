import { Stack } from 'expo-router/stack';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AppProviders } from '@/_app/providers';
import '@/_app/styles/global.css';
import {
  initSession,
  markPendingDeletion,
  useIsAuthenticated,
  useIsPendingDeletion,
  useIsRecovering,
  useSessionHydrated,
} from '@/entities/session';
import { readPurgeAfter } from '@/features/delete-account';
import { subscribeToApiErrors } from '@/shared/api';
import { Fonts, useTheme } from '@/shared/ui/theme';

import { AnimatedSplashOverlay } from './animated-splash-overlay';
import './register-background-tasks';

void SplashScreen.preventAutoHideAsync();

export function RootLayout() {
  // Mirror Supabase's auth state into the session store and bind token refresh
  // to the app lifecycle for as long as the app is mounted. Auth email deep
  // links are handled by the `auth/callback` and `auth/reset` route screens.
  useEffect(() => initSession(), []);

  // A soft-deleted account still authenticates; the backend rejects every
  // other request with this code, and attaches the purge deadline to it.
  // Whichever call trips it first (profile fetch, FCM registration, an upload)
  // flips the session flag, and the guard below swaps the app for the restore
  // screen.
  useEffect(
    () =>
      subscribeToApiErrors((error) => {
        if (error.code === 'ACCOUNT_PENDING_DELETION') markPendingDeletion(readPurgeAfter(error));
      }),
    [],
  );

  return (
    <AppProviders>
      <AnimatedSplashOverlay />
      <RootStack />
    </AppProviders>
  );
}

function RootStack() {
  const theme = useTheme();
  const hasHydrated = useSessionHydrated();
  const isAuthenticated = useIsAuthenticated();
  const isRecovering = useIsRecovering();
  const isPendingDeletion = useIsPendingDeletion();

  // Keep the splash overlay in place until the persisted session is read back,
  // so an authenticated user never sees a flash of the sign-in screen.
  if (!hasHydrated) return null;

  return (
    <Stack
      screenOptions={{
        headerBackButtonDisplayMode: 'minimal',
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        // A header title is the one piece of app text React Navigation draws
        // rather than `ThemedText`, so it names the family itself. The weight is
        // explicit because the navigator's own default is 600 — the one weight
        // that is not embedded (see `Fonts`) — which would resolve down to 500
        // and leave every header lighter than the `heading` it stands in for.
        headerTitleStyle: { fontFamily: Fonts.sans, fontWeight: 700 },
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      {/* Declaration order is also fallback priority: when a guard flips and
          yanks the current screen, the router redirects to the FIRST available
          screen in declaration order. The guarded groups therefore come first,
          most-specific state first, and the unguarded auth/* landings come
          LAST — an always-available screen declared early becomes the fallback
          for every state, and the callback spinner (which needs a `code` param
          to go anywhere) dead-ends whoever gets dropped on it (verified on
          device, 2026-08-12). */}

      {/* An account inside its deletion grace period authenticates but must
          not reach the app — every request would fail with the same 403. The
          only ways forward are restoring or signing out, both on this screen. */}
      <Stack.Protected guard={isAuthenticated && isPendingDeletion && !isRecovering}>
        <Stack.Screen
          name="account-restore"
          options={{ headerShown: false, gestureEnabled: false }}
        />
      </Stack.Protected>

      {/* A password-recovery deep link signs the user in but must not reach the
          app until a new password is set — this takes precedence over the
          authenticated group below. */}
      <Stack.Protected guard={isRecovering}>
        <Stack.Screen
          name="update-password"
          options={{ title: '새 비밀번호 설정', headerBackVisible: false, gestureEnabled: false }}
        />
      </Stack.Protected>

      <Stack.Protected guard={isAuthenticated && !isRecovering && !isPendingDeletion}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen
          name="capture/index"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        {/* Extracting snaps out of a gallery video is capture's import-side
            sibling — the same full-screen, task-shaped visit over a dark video
            ground, so it presents the same way. */}
        <Stack.Screen
          name="extract"
          options={{ headerShown: false, presentation: 'fullScreenModal' }}
        />
        {/* One screen per movie, whatever point of its life it is at: watching a
            finished movie and fixing it are the same visit, so a second route
            would only have meant two places that can edit one cut list. It is a
            pushed screen rather than a tab because it is a task with a beginning
            and an end, and its own back affordance.

            That affordance is the page's own `BackBar`, not a navigation bar: a
            titled bar here could only have said `무비`, one line above the
            movie's actual name, and the gap it left between the two was the
            emptiest part of the screen. */}
        <Stack.Screen name="movie/[id]/index" options={{ headerShown: false }} />
        {/* The movie's "스냅 더 넣기" picker. It belongs to the root stack rather
            than the Snap tab it resembles: pushing a tab route from the movie
            screen mounts a second tab navigator over it, and that navigator
            answers the confirming `back` by switching tabs — which is how
            adding a cut used to land the user on the studio. */}
        <Stack.Screen name="movie/[id]/add-snaps" options={{ headerShown: false }} />
        {/* Picking a template is the other way into a movie, and it is a task of
            the same shape: it opens over the studio and leaves on the movie it
            made — headerless for the same reason. */}
        <Stack.Screen name="template/[id]" options={{ headerShown: false }} />
        {/* The 나 tab's settings screens. Each holds the controls whose current
            state the tab shows as a one-line summary row; they are pushed
            screens with the stack's own titled header, because unlike the
            movie screen the title here is not one line above the same words. */}
        <Stack.Screen name="settings/credits" options={{ title: '크레딧' }} />
        <Stack.Screen name="settings/notifications" options={{ title: '알림' }} />
        <Stack.Screen name="settings/theme" options={{ title: '화면 테마' }} />
        <Stack.Screen name="settings/interests" options={{ title: '관심사' }} />
        <Stack.Screen name="settings/social" options={{ title: '소셜 연결' }} />
        <Stack.Screen name="settings/delete-account" options={{ title: '계정 삭제' }} />
      </Stack.Protected>

      <Stack.Protected guard={!isAuthenticated && !isRecovering}>
        <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        <Stack.Screen name="sign-up" options={{ title: '회원가입' }} />
        <Stack.Screen name="reset-password" options={{ title: '비밀번호 재설정' }} />
      </Stack.Protected>

      {/* Auth email deep-link landing screens. Declared outside every guard so
          the link resolves regardless of auth state — but LAST, so they are
          never the fallback a guard change redirects to (see the ordering
          comment above); each exchanges the code and redirects (see
          AuthCallbackPage). */}
      <Stack.Screen name="auth/callback" options={{ headerShown: false }} />
      <Stack.Screen name="auth/reset" options={{ headerShown: false }} />
    </Stack>
  );
}

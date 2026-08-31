import { QueryClientProvider } from '@tanstack/react-query';
import { NavigationBar } from 'expo-navigation-bar';
import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { PropsWithChildren } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DeletedLibraryPurgeGate } from '@/features/delete-account';
import { SnapUploadGate } from '@/features/upload-snap';
import { Colors, useResolvedColorScheme } from '@/shared/ui/theme';

import { GeofenceGate } from './geofence-gate';
import { LibraryScopeGate } from './library-scope-gate';
import { MovieGenerationBridge } from './movie-generation-bridge';
import { PushTokenGate } from './push-token-gate';
import { queryClient } from './query-client';
import { SnapDurationBackfill } from './snap-duration-backfill';
import { TrayDraftMigration } from './tray-draft-migration';

// Navigation chrome recolors the matching base theme with the app palette of
// the resolved scheme, so headers, backgrounds, and transitions follow the
// theme mode (system / light / dark).
function buildNavigationTheme(scheme: 'light' | 'dark') {
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const palette = Colors[scheme];
  return {
    ...base,
    colors: {
      ...base.colors,
      primary: palette.primary,
      background: palette.background,
      card: palette.backgroundElement,
      text: palette.text,
      border: palette.border,
      notification: palette.ai,
    },
  };
}

export function AppProviders({ children }: PropsWithChildren) {
  const scheme = useResolvedColorScheme();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={buildNavigationTheme(scheme)}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {/* Android 3-button navigation: light buttons over the dark shell,
            dark buttons over the light shell. No-op on iOS/web.
            `style` names the button color, exactly like StatusBar above — the
            `NavigationBarStyle` doc comment claims the opposite, but the native
            module reads it as content color (`hasLightBackground = style ==
            "dark"` -> dark glyphs), so it must track StatusBar, not invert it. */}
        <NavigationBar style={scheme === 'dark' ? 'light' : 'dark'} />
        {/* First of the headless gates: everything below reads snaps, movies,
            or the query cache, and none of it may run against the account that
            just signed out. */}
        <LibraryScopeGate />
        {/* Deleted accounts leave their library behind for the length of the
            grace period; this is what collects it once that has run out. */}
        <DeletedLibraryPurgeGate />
        <PushTokenGate />
        <GeofenceGate />
        {/* Movie generation runs here rather than on the movie screen: a job is meant
            to keep going after the user leaves the screen, and to be picked back
            up on the next app start if they left before it finished. */}
        <MovieGenerationBridge />
        {/* Snaps captured before their length was measured claim the capture
            option they were shot with; this reads the real length back from the
            files, once, in the background. */}
        <SnapDurationBackfill />
        {/* Picks left in the removed 담기 트레이 by an older build become the
            draft movie they were headed for, once. */}
        <TrayDraftMigration />
        {/* Uploads live here for the same reason generation does: a capture's
            trip to the backend continues wherever the user navigates next. */}
        <SnapUploadGate />
        {/* Gesture-handler gestures need this ancestor; expo-router's native
            stack does not provide one. */}
        <GestureHandlerRootView style={styles.root}>{children}</GestureHandlerRootView>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});

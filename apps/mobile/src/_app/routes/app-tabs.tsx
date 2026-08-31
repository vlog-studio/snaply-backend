import { Ionicons } from '@expo/vector-icons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { Tabs, useIsFocused, useRouter } from 'expo-router';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from 'react';
import { Pressable, StyleSheet, View, type ColorValue } from 'react-native';

import { impactFeedback } from '@/shared/lib/haptics';
import { useTabBarHidden } from '@/shared/ui/tab-bar-chrome';
import {
  Radius,
  TabBarContentHeight,
  useReducedMotion,
  useResolvedColorScheme,
  useTheme,
} from '@/shared/ui/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type TabIconName = keyof typeof Ionicons.glyphMap;

// On Android the BlurView cannot sample the hierarchy behind it by itself: it
// must be pointed at a BlurTargetView, and that target must not contain the
// BlurView (Dimezis BlurView v3 constraint) — so wrapping the whole navigator
// is not an option. Instead every tab scene is wrapped in a BlurTargetView
// (a plain View on iOS/web) and the focused scene registers itself as the tab
// bar's blur source.
const SceneBlurTargetContext = createContext<Dispatch<SetStateAction<View | null>>>(() => {});

function SceneBlurTarget({ children }: PropsWithChildren) {
  const theme = useTheme();
  const setBlurTarget = useContext(SceneBlurTargetContext);
  const sceneRef = useRef<View | null>(null);
  const isFocused = useIsFocused();

  useEffect(() => {
    if (!isFocused) return;
    const view = sceneRef.current;
    setBlurTarget(view);
    // Deregister on blur/unmount: a stale unmounted view left registered makes
    // the BlurView's findNodeHandle throw ("Unable to find node on an unmounted
    // component"). Clear only if another scene hasn't registered itself since.
    return () => {
      setBlurTarget((current) => (current === view ? null : current));
    };
  }, [isFocused, setBlurTarget]);

  return (
    // The blur samples only this subtree, so it must paint its own opaque
    // background even though the scene container behind it already has one.
    <BlurTargetView ref={sceneRef} style={[styles.scene, { backgroundColor: theme.background }]}>
      {children}
    </BlurTargetView>
  );
}

export function AppTabs() {
  const theme = useTheme();
  const scheme = useResolvedColorScheme();
  // A fixed `height` overrides the automatic bottom safe-area inset, so add it
  // back explicitly — otherwise the bar overlaps the Android navigation bar.
  const inset = useSafeAreaInsets();
  const [blurTargetView, setBlurTargetView] = useState<View | null>(null);
  // A screen can take the bottom of the shell over with an action bar of its
  // own; while it does, the bar and the capture button step aside entirely
  // rather than painting on top of it.
  const tabBarHidden = useTabBarHidden();
  const reducedMotion = useReducedMotion();

  return (
    <SceneBlurTargetContext value={setBlurTargetView}>
      <Tabs
        // Four tabs with the capture button centered over them as an overlay
        // (CaptureButton below), not as a tab, because /capture is a modal in
        // the root stack rather than a tab route. Four flex:1 items would put
        // the button on top of the inner two, so those two give up half of
        // `CaptureLane` as a margin: the bar reads and behaves as five slots,
        // and the button owns the middle one outright.
        screenLayout={({ children }) => <SceneBlurTarget>{children}</SceneBlurTarget>}
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          // Tab switches cross-fade with a slight lateral shift on both
          // platforms — the JS tab navigator animates nothing by default,
          // which reads as a hard cut on Android especially.
          animation: reducedMotion ? 'none' : 'shift',
          // All four scenes mount at launch: a lazily-mounted scene's first
          // frame is its empty background, and the cross-fade stretches that
          // blank frame into a visible blink on the first visit to a tab.
          // Visited tabs stay mounted anyway (per-tab scroll retention), so
          // this only moves render cost to startup, behind the splash overlay.
          lazy: false,
          sceneStyle: { backgroundColor: theme.background },
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.tabInactive,
          // The bar floats over the scene so its blur has content to sample;
          // screens offset their scroll content with `useTabBarHeight`.
          tabBarBackground: () => (
            <BlurView
              tint={scheme === 'dark' ? 'dark' : 'light'}
              intensity={60}
              // Real background blur on Android SDK 31+, graceful semi-transparent
              // fallback on older versions.
              blurMethod="dimezisBlurViewSdk31Plus"
              blurTarget={{ current: blurTargetView }}
              style={StyleSheet.absoluteFill}
            />
          ),
          tabBarStyle: {
            position: 'absolute',
            display: tabBarHidden ? 'none' : 'flex',
            backgroundColor: 'transparent',
            borderTopColor: theme.border,
            borderTopWidth: StyleSheet.hairlineWidth,
            height: inset.bottom + TabBarContentHeight,
            paddingBottom: inset.bottom,
          },
          tabBarItemStyle: styles.tabItem,
          tabBarButton: ({ ref, ...props }) => <Pressable {...props} android_ripple={null} />,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: '스튜디오',
            tabBarAccessibilityLabel: '스튜디오',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon color={color} name={focused ? 'albums' : 'albums-outline'} />
            ),
          }}
        />
        <Tabs.Screen
          name="snaps"
          options={{
            title: '스냅',
            tabBarAccessibilityLabel: '스냅',
            // Last item before the capture lane; see `CaptureLane`.
            tabBarItemStyle: [styles.tabItem, styles.tabItemBeforeCapture],
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon color={color} name={focused ? 'grid' : 'grid-outline'} />
            ),
          }}
        />
        <Tabs.Screen
          name="movies"
          options={{
            title: '무비',
            tabBarAccessibilityLabel: '무비',
            // First item after the capture lane; see `CaptureLane`.
            tabBarItemStyle: [styles.tabItem, styles.tabItemAfterCapture],
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon color={color} name={focused ? 'film' : 'film-outline'} />
            ),
          }}
        />
        <Tabs.Screen
          name="me"
          options={{
            title: '나',
            tabBarAccessibilityLabel: '나',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon color={color} name={focused ? 'person' : 'person-outline'} />
            ),
          }}
        />
      </Tabs>
      {/* Capture is always one tap, centered over the bar on every tab. It opens
          the /capture modal in the root stack. It leaves with the bar: a screen
          that owns the bottom is not offering to shoot. */}
      {tabBarHidden ? null : <CaptureButton bottom={inset.bottom} />}
    </SceneBlurTargetContext>
  );
}

// Capture button, seated in the lane the two inner tab items keep clear for it
// and lifted just clear of the bar's top edge. Lives outside <Tabs> because
// /capture is a root-stack modal, not a tab route; the container is
// pointer-transparent so only the button itself is tappable. Its touch area is
// exactly the circle the user can see — no tab item's area is taken, and no
// invisible margin around it opens the camera by surprise.
function CaptureButton({ bottom }: { bottom: number }) {
  const theme = useTheme();
  const router = useRouter();

  const openCapture = () => {
    // A full-screen modal is a large jump for one small button, so the press
    // is acknowledged in the hand as well as on screen.
    impactFeedback('light');
    router.push('/capture');
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <Pressable
        accessibilityLabel="촬영"
        accessibilityRole="button"
        onPress={openCapture}
        style={[
          styles.capture,
          {
            bottom: bottom + TabBarContentHeight + CaptureLift - CaptureSize,
            backgroundColor: theme.primary,
            borderColor: theme.background,
          },
        ]}
      >
        <Ionicons color={theme.onPrimary} name="ellipse" size={20} />
      </Pressable>
    </View>
  );
}

function TabBarIcon({ color, name }: { color: ColorValue; name: TabIconName }) {
  return <Ionicons color={color} name={name} size={24} />;
}

/** Diameter of the capture button, its ring included. */
const CaptureSize = 52;
/** Clearance kept between the button and the nearest tab item on either side. */
const CaptureGutter = 14;
/**
 * Width the bar reserves in its middle for the capture button. The two inner
 * tab items each give up half of it, which is what turns four flex:1 items
 * into a five-slot bar. Derived from `CaptureSize` so resizing the button
 * cannot leave the lane behind.
 */
const CaptureLane = CaptureSize + CaptureGutter * 2;
/** How far the button's top edge rises above the bar's top edge. */
const CaptureLift = 10;

const styles = StyleSheet.create({
  scene: { flex: 1 },
  tabItem: { borderRadius: Radius.pill },
  tabItemBeforeCapture: { marginEnd: CaptureLane / 2 },
  tabItemAfterCapture: { marginStart: CaptureLane / 2 },
  capture: {
    position: 'absolute',
    alignSelf: 'center',
    width: CaptureSize,
    height: CaptureSize,
    borderRadius: CaptureSize / 2,
    // A ring in the ground color separates the button from the blurred bar.
    borderWidth: 4,
    alignItems: 'center',
    justifyContent: 'center',
    // The button now nests into the bar rather than floating over it, so it
    // casts elevation rather than the halo it used to bleed onto its neighbors.
    boxShadow: '0 4px 12px rgba(234,94,56,0.35)',
  },
});

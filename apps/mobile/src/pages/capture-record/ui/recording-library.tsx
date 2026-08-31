import { Alert, FlatList, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { formatDateTime } from '@/shared/lib/datetime';
import { formatFileSize } from '@/shared/lib/format-file-size';
import type { LocalRecording } from '@/shared/lib/recording-files';
import { Radius, Spacing, useTheme } from '@/shared/ui/theme';
import { ThemedText } from '@/shared/ui/themed-text';

type RecordingLibraryProps = {
  deletingId?: string;
  isLoading: boolean;
  onClose: () => void;
  onDelete: (recording: LocalRecording) => Promise<void>;
  onSelect: (recording: LocalRecording) => void;
  recordings: LocalRecording[];
  visible: boolean;
};

export function RecordingLibrary({
  deletingId,
  isLoading,
  onClose,
  onDelete,
  onSelect,
  recordings,
  visible,
}: RecordingLibraryProps) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  const confirmDelete = (recording: LocalRecording) => {
    Alert.alert('영상을 삭제할까요?', '삭제한 영상은 복구할 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제',
        style: 'destructive',
        onPress: () => void onDelete(recording),
      },
    ]);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      visible={visible}
    >
      <View
        style={[
          styles.screen,
          {
            backgroundColor: theme.background,
            paddingTop: insets.top + Spacing.three,
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.titleBlock}>
            <ThemedText type="heading">내 촬영 영상</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              앱에 저장된 영상 {recordings.length}개
            </ThemedText>
          </View>
          <Pressable
            accessibilityLabel="스냅 목록 닫기"
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.closeButton, { backgroundColor: theme.backgroundElement }]}
          >
            <ThemedText selectable={false} style={styles.closeIcon}>
              ×
            </ThemedText>
          </Pressable>
        </View>

        <FlatList
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={[
            styles.listContent,
            recordings.length === 0 && styles.emptyListContent,
          ]}
          data={recordings}
          keyExtractor={(item) => item.id}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <View style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}>
                <ThemedText selectable={false} style={styles.emptyIconText}>
                  ▶
                </ThemedText>
              </View>
              <ThemedText type="heading">
                {isLoading ? '영상을 불러오는 중' : '아직 저장된 영상이 없어요'}
              </ThemedText>
            </View>
          }
          renderItem={({ item }) => {
            const isDeleting = deletingId === item.id;

            return (
              <View
                style={[
                  styles.recordingRow,
                  { backgroundColor: theme.backgroundElement, borderColor: theme.border },
                ]}
              >
                <Pressable
                  accessibilityHint="영상을 재생하고 사용할 수 있어요"
                  accessibilityLabel={`${formatDateTime(item.createdAt)} 촬영 영상`}
                  accessibilityRole="button"
                  disabled={isDeleting}
                  onPress={() => onSelect(item)}
                  style={styles.recordingMain}
                >
                  <View style={[styles.playIcon, { backgroundColor: theme.media }]}>
                    <ThemedText selectable={false} style={styles.playIconText}>
                      ▶
                    </ThemedText>
                  </View>
                  <View style={styles.recordingCopy}>
                    <ThemedText type="smallBold">{formatDateTime(item.createdAt)}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatFileSize(item.size)} · 앱에 저장됨
                    </ThemedText>
                  </View>
                </Pressable>
                <Pressable
                  accessibilityLabel={`${formatDateTime(item.createdAt)} 영상 삭제`}
                  accessibilityRole="button"
                  disabled={isDeleting}
                  onPress={() => confirmDelete(item)}
                  style={styles.deleteButton}
                >
                  <ThemedText type="smallBold" themeColor="danger">
                    {isDeleting ? '삭제 중' : '삭제'}
                  </ThemedText>
                </Pressable>
              </View>
            );
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.five,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  titleBlock: { flex: 1, gap: Spacing.one },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeIcon: { fontSize: 28, lineHeight: 30 },
  listContent: { paddingHorizontal: Spacing.five, paddingBottom: Spacing.five, gap: Spacing.three },
  emptyListContent: { flexGrow: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', gap: Spacing.three, padding: Spacing.six },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyIconText: { fontSize: 26 },
  recordingRow: {
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: Radius.medium,
    borderCurve: 'continuous',
  },
  recordingMain: {
    flex: 1,
    minHeight: 84,
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.three,
    gap: Spacing.three,
  },
  playIcon: {
    width: 54,
    height: 54,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playIconText: { color: '#FFFFFF', fontSize: 20 },
  recordingCopy: { flex: 1, gap: Spacing.one },
  deleteButton: { minWidth: 64, minHeight: 64, alignItems: 'center', justifyContent: 'center' },
});

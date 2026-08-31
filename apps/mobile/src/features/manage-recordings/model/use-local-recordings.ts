import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listLocalRecordings,
  persistLocalRecording,
  type LocalRecording,
} from '@/shared/lib/recording-files';

/**
 * Lists and saves the recording files on this device.
 *
 * Deletion deliberately does not live here. An original is more than its file —
 * it also has snap metadata and references held by movies — so removing one is a
 * cross-entity action owned by `features/delete-snap`. Callers of this hook
 * reload the list after that action reports what it deleted.
 */
export function useLocalRecordings() {
  const isMounted = useRef(true);
  const [recordings, setRecordings] = useState<LocalRecording[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string>();

  const reloadRecordings = useCallback(async () => {
    try {
      const storedRecordings = await listLocalRecordings();
      if (isMounted.current) {
        setRecordings(storedRecordings);
        setErrorMessage(undefined);
      }
    } catch {
      if (isMounted.current) setErrorMessage('저장된 영상 목록을 불러오지 못했어요.');
    } finally {
      if (isMounted.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    isMounted.current = true;

    void listLocalRecordings()
      .then((storedRecordings) => {
        if (isMounted.current) {
          setRecordings(storedRecordings);
          setErrorMessage(undefined);
        }
      })
      .catch(() => {
        if (isMounted.current) setErrorMessage('저장된 영상 목록을 불러오지 못했어요.');
      })
      .finally(() => {
        if (isMounted.current) setIsLoading(false);
      });

    return () => {
      isMounted.current = false;
    };
  }, []);

  const saveRecording = async (temporaryUri: string) => {
    try {
      const recording = await persistLocalRecording(temporaryUri);
      if (isMounted.current) {
        setRecordings((current) => [recording, ...current]);
        setErrorMessage(undefined);
      }
      return recording;
    } catch {
      if (isMounted.current)
        setErrorMessage('촬영한 영상을 저장하지 못했어요. 다시 시도해 주세요.');
      return undefined;
    }
  };

  return {
    recordings,
    isLoading,
    errorMessage,
    clearError: () => setErrorMessage(undefined),
    reloadRecordings,
    saveRecording,
  };
}

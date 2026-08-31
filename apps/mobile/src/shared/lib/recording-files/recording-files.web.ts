import type { LocalRecording } from './recording-file';

export async function persistLocalRecording(_temporaryUri: string): Promise<LocalRecording> {
  throw new Error('Video recording is only available on iOS and Android.');
}

export async function listLocalRecordings(): Promise<LocalRecording[]> {
  return [];
}

export async function deleteLocalRecording(_uri: string): Promise<void> {}

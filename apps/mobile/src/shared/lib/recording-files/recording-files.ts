import { Directory, File, Paths } from 'expo-file-system';

import type { LocalRecording } from './recording-file';

const RECORDINGS_DIRECTORY_NAME = 'recordings';
const VIDEO_EXTENSIONS = new Set(['.m4v', '.mov', '.mp4', '.webm']);

const recordingsDirectory = new Directory(Paths.document, RECORDINGS_DIRECTORY_NAME);

function ensureRecordingsDirectory() {
  recordingsDirectory.create({ idempotent: true, intermediates: true });
}

function toLocalRecording(file: File): LocalRecording {
  return {
    id: file.name,
    uri: file.uri,
    fileName: file.name,
    size: file.size,
    createdAt: file.creationTime ?? file.lastModified ?? Date.now(),
  };
}

function isVideoFile(entry: Directory | File): entry is File {
  return entry instanceof File && VIDEO_EXTENSIONS.has(entry.extension.toLowerCase());
}

export async function persistLocalRecording(temporaryUri: string): Promise<LocalRecording> {
  ensureRecordingsDirectory();

  const temporaryFile = new File(temporaryUri);
  if (!temporaryFile.exists) {
    throw new Error('The temporary recording file does not exist.');
  }

  const extension = VIDEO_EXTENSIONS.has(temporaryFile.extension.toLowerCase())
    ? temporaryFile.extension.toLowerCase()
    : '.mp4';
  const destination = new File(recordingsDirectory, `snaply-${Date.now()}${extension}`);

  await temporaryFile.move(destination);

  return toLocalRecording(new File(destination.uri));
}

export async function listLocalRecordings(): Promise<LocalRecording[]> {
  ensureRecordingsDirectory();

  return recordingsDirectory
    .list()
    .filter(isVideoFile)
    .map(toLocalRecording)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export async function deleteLocalRecording(uri: string): Promise<void> {
  ensureRecordingsDirectory();

  const file = new File(uri);
  if (file.parentDirectory.uri !== recordingsDirectory.uri) {
    throw new Error('Only Snaply recordings can be deleted.');
  }

  if (file.exists) file.delete();
}

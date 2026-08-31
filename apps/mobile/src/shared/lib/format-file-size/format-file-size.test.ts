import { formatFileSize } from './format-file-size';

describe('formatFileSize', () => {
  it.each([
    [0, '1KB'],
    [512, '1KB'],
    [1_536, '2KB'],
    [1_048_576, '1.0MB'],
    [1_572_864, '1.5MB'],
  ])('formats %i bytes as %s', (bytes, formattedSize) => {
    expect(formatFileSize(bytes)).toBe(formattedSize);
  });
});

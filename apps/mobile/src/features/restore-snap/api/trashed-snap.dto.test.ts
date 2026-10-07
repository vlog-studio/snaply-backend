import { mapTrashedSnaps, trashListDtoSchema } from './trashed-snap.dto';

describe('trashed snaps on the wire', () => {
  it('reads what the trash draws, and falls back to the deletion time for an unknown capture time', () => {
    const dto = trashListDtoSchema.parse({
      items: [
        {
          id: 'v1',
          clientId: 'snaply-1.mp4',
          capturedAt: '2026-10-03T05:14:00.000Z',
          durationMs: 3200,
          width: 1080,
          height: 1920,
          thumbnailUrl: 'https://cdn.example/v1.jpg',
          deletedAt: '2026-10-07T01:00:00.000Z',
          restorableUntil: '2026-10-18T05:00:00.000Z',
        },
        {
          id: 'v2',
          clientId: null,
          capturedAt: null,
          durationMs: null,
          width: null,
          height: null,
          thumbnailUrl: null,
          deletedAt: '2026-10-06T01:00:00.000Z',
          restorableUntil: '2026-10-10T05:00:00.000Z',
        },
      ],
    });

    expect(mapTrashedSnaps(dto)).toEqual([
      {
        videoId: 'v1',
        capturedAt: Date.parse('2026-10-03T05:14:00.000Z'),
        durationSec: 3.2,
        thumbnailUrl: 'https://cdn.example/v1.jpg',
        deletedAt: Date.parse('2026-10-07T01:00:00.000Z'),
        restorableUntil: Date.parse('2026-10-18T05:00:00.000Z'),
      },
      {
        videoId: 'v2',
        capturedAt: Date.parse('2026-10-06T01:00:00.000Z'),
        durationSec: 0,
        deletedAt: Date.parse('2026-10-06T01:00:00.000Z'),
        restorableUntil: Date.parse('2026-10-10T05:00:00.000Z'),
      },
    ]);
  });
});

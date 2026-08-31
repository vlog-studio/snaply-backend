import type { Location } from '@/entities/location';

import { MAX_MONITORED_REGIONS, selectNearestRegions } from './select-nearest-regions';

const origin = { latitude: 37.5, longitude: 127 };

function location(id: string, latitude: number, longitude = 127): Location {
  return {
    id,
    name: id,
    latitude,
    longitude,
    radiusMeters: 150,
    category: 'test',
  };
}

describe('selectNearestRegions', () => {
  it('selects by geographic distance without changing the source order', () => {
    const locations = [
      location('far', 37.7),
      location('nearest', 37.501),
      location('middle', 37.55),
    ];

    const regions = selectNearestRegions(locations, origin, 2);

    expect(regions.map((region) => region.identifier)).toEqual(['nearest', 'middle']);
    expect(locations.map((item) => item.id)).toEqual(['far', 'nearest', 'middle']);
  });

  it('maps domain locations to arrival-only native regions', () => {
    expect(selectNearestRegions([location('loc-1', 37.501)], origin)).toEqual([
      {
        identifier: 'loc-1',
        latitude: 37.501,
        longitude: 127,
        radius: 150,
        notifyOnEnter: true,
        notifyOnExit: false,
      },
    ]);
  });

  it('stays within the stricter platform region limit', () => {
    const locations = Array.from({ length: MAX_MONITORED_REGIONS + 5 }, (_, index) =>
      location(`loc-${index}`, origin.latitude + index / 10_000),
    );

    expect(selectNearestRegions(locations, origin)).toHaveLength(MAX_MONITORED_REGIONS);
  });
});

import { locationDtoSchema, locationsDtoSchema, mapLocation } from './location.dto';

// A response body exactly as the backend API spec documents it, including the
// `distanceMeters` field the app does not consume.
const wireLocation = {
  id: 'loc-1',
  name: '성수동 카페거리', // 성수동 카페거리
  lat: 37.544,
  lng: 127.0558,
  radiusMeters: 500,
  category: '카페', // 카페
  distanceMeters: 120,
};

describe('location DTO', () => {
  describe('locationDtoSchema', () => {
    it('accepts the documented wire shape and strips unmapped fields', () => {
      const parsed = locationDtoSchema.parse(wireLocation);

      expect(parsed).toEqual({
        id: 'loc-1',
        name: wireLocation.name,
        lat: 37.544,
        lng: 127.0558,
        radiusMeters: 500,
        category: wireLocation.category,
      });
    });

    it('accepts a category the app has not seen, because the backend field is free-form', () => {
      const category = '맛집'; // 맛집

      expect(locationDtoSchema.parse({ ...wireLocation, category }).category).toBe(category);
    });

    it.each(['radiusMeters', 'lat', 'lng', 'id', 'name', 'category'] as const)(
      'rejects a response missing the required field "%s"',
      (field) => {
        const { [field]: _omitted, ...incomplete } = wireLocation;

        expect(() => locationDtoSchema.parse(incomplete)).toThrow();
      },
    );

    it('rejects a fractional radius', () => {
      expect(() => locationDtoSchema.parse({ ...wireLocation, radiusMeters: 500.5 })).toThrow();
    });

    it('parses a list of locations', () => {
      expect(locationsDtoSchema.parse([wireLocation, wireLocation])).toHaveLength(2);
    });
  });

  describe('mapLocation', () => {
    it('maps the wire coordinates onto the domain model', () => {
      expect(mapLocation(locationDtoSchema.parse(wireLocation))).toEqual({
        id: 'loc-1',
        name: wireLocation.name,
        latitude: 37.544,
        longitude: 127.0558,
        radiusMeters: 500,
        category: wireLocation.category,
      });
    });
  });
});

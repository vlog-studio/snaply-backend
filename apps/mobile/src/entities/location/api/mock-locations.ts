import type { LocationDto } from './location.dto';

/**
 * Development fixtures for `GET /locations` while no API origin is configured.
 * Stored in the wire DTO shape so the mock exercises the same validation and
 * mapping path as the real endpoint. A representative subset of the backend's
 * seed list (Seoul landmarks, café districts, Jeju spots).
 *
 * `distanceMeters` is omitted: the real endpoint computes it against the caller's
 * coordinates, and the app does not consume it (see `location.dto.ts`).
 */
export const mockLocationDtos: LocationDto[] = [
  {
    id: 'mock-gyeongbokgung',
    name: '경복궁',
    lat: 37.5796,
    lng: 126.977,
    radiusMeters: 500,
    category: '관광지',
  },
  {
    id: 'mock-nseoul-tower',
    name: '남산서울타워',
    lat: 37.5512,
    lng: 126.9882,
    radiusMeters: 500,
    category: '관광지',
  },
  {
    id: 'mock-bukchon',
    name: '북촌한옥마을',
    lat: 37.5826,
    lng: 126.983,
    radiusMeters: 500,
    category: '관광지',
  },
  {
    id: 'mock-seongsu',
    name: '성수동 카페거리',
    lat: 37.5445,
    lng: 127.0559,
    radiusMeters: 500,
    category: '카페',
  },
  {
    id: 'mock-yeonnam',
    name: '연남동',
    lat: 37.5626,
    lng: 126.925,
    radiusMeters: 500,
    category: '카페',
  },
  {
    id: 'mock-hongdae',
    name: '홍대',
    lat: 37.5561,
    lng: 126.9236,
    radiusMeters: 500,
    category: '카페',
  },
  {
    id: 'mock-seongsan',
    name: '성산일출봉',
    lat: 33.4581,
    lng: 126.9425,
    radiusMeters: 500,
    category: '여행지',
  },
  {
    id: 'mock-hyeopjae',
    name: '협재해변',
    lat: 33.394,
    lng: 126.2396,
    radiusMeters: 500,
    category: '여행지',
  },
];

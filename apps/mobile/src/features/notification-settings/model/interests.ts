/**
 * Selectable interest tags used to personalize location alerts. Mirrors the
 * backend `users.interests` concept (free-form text[]); this curated set is the
 * app's presented options and can be extended without a schema change.
 */
export const INTEREST_OPTIONS = ['여행', '일상', '카페', '맛집', '감성'] as const;

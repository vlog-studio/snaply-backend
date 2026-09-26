/**
 * The interest tags the app offers. Mirrors the backend `users.interests`
 * concept (free-form text[]); this curated set can be extended without a schema
 * change.
 *
 * Nothing reads a selection yet — the app never sent one, and the server's
 * location push does not consult it — so the 나 tab shows 관심사 as 준비 중 with
 * no picker (backlog A-9). Kept for when something does.
 */
export const INTEREST_OPTIONS = ['여행', '일상', '카페', '맛집', '감성'] as const;

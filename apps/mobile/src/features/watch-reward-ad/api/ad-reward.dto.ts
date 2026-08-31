import { z } from 'zod';

import type { AdRewardAvailability, AdRewardSession, AdRewardStatus } from '../model/ad-reward';

/** Wire shape of `GET /billing/ad-rewards` (`data`). */
export const adRewardAvailabilityDtoSchema = z.object({
  enabled: z.boolean(),
  rewardCredits: z.number().int(),
  dailyLimit: z.number().int(),
  remainingToday: z.number().int(),
  nextAvailableAt: z.string().nullable(),
  resetsAt: z.string(),
});

export type AdRewardAvailabilityDto = z.infer<typeof adRewardAvailabilityDtoSchema>;

export function mapAdRewardAvailability(dto: AdRewardAvailabilityDto): AdRewardAvailability {
  return {
    enabled: dto.enabled,
    rewardCredits: dto.rewardCredits,
    dailyLimit: dto.dailyLimit,
    remainingToday: dto.remainingToday,
    nextAvailableAt: dto.nextAvailableAt === null ? undefined : new Date(dto.nextAvailableAt),
    resetsAt: new Date(dto.resetsAt),
  };
}

/** Wire shape of `POST /billing/ad-rewards` (`data`). */
export const adRewardSessionDtoSchema = z.object({
  rewardId: z.string(),
  nonce: z.string(),
  ssvUserId: z.string(),
  rewardCredits: z.number().int(),
  expiresAt: z.string(),
});

export type AdRewardSessionDto = z.infer<typeof adRewardSessionDtoSchema>;

export function mapAdRewardSession(dto: AdRewardSessionDto): AdRewardSession {
  return {
    rewardId: dto.rewardId,
    nonce: dto.nonce,
    ssvUserId: dto.ssvUserId,
    rewardCredits: dto.rewardCredits,
    expiresAt: new Date(dto.expiresAt),
  };
}

/** Wire shape of `GET /billing/ad-rewards/{rewardId}` (`data`). */
export const adRewardStatusDtoSchema = z.object({
  rewardId: z.string(),
  status: z.enum(['pending', 'abandoned', 'granted', 'expired', 'rejected']),
  credits: z.number().int().nullable(),
  balance: z.number().int(),
});

export type AdRewardStatusDto = z.infer<typeof adRewardStatusDtoSchema>;

export function mapAdRewardStatus(dto: AdRewardStatusDto): AdRewardStatus {
  return {
    rewardId: dto.rewardId,
    status: dto.status,
    credits: dto.credits === null ? undefined : dto.credits,
    balance: dto.balance,
  };
}

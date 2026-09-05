import { z } from 'zod';

import { COMMON_ERROR_RESPONSES, apiSuccess } from './common.js';
import { defineRoute } from './define-route.js';

export const healthDataSchema = z.object({
  status: z.literal('ok'),
  uptimeSeconds: z.int().min(0),
  db: z.enum(['connected', 'not_configured', 'error']),
});
export type HealthData = z.infer<typeof healthDataSchema>;

export const getHealth = defineRoute({
  method: 'GET',
  path: '/health',
  schema: {
    response: {
      200: apiSuccess(healthDataSchema),
      ...COMMON_ERROR_RESPONSES,
    },
  },
});

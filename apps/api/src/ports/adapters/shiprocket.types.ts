import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────────────────────────────

export const authResponseSchema = z.object({
  token: z.string(),
  refresh_token: z.string().optional(),
  /** seconds until expiry, if present */
  expires_in: z.number().optional(),
});

export type AuthResponse = z.infer<typeof authResponseSchema>;

// ── Serviceability ────────────────────────────────────────────────────────────

const serviceabilityDataSchema = z.object({
  available_courier_companies: z.array(
    z.object({
      id: z.number(),
      courier_name: z.string(),
      rate: z.number(),
      etd: z.string().nullable().optional(),
      estimated_delivery_days: z.number().nullable().optional(),
    }),
  ),
});

export const serviceabilityResponseSchema = z.object({
  status: z.number().optional(),
  data: serviceabilityDataSchema.optional(),
});

export type ServiceabilityResponse = z.infer<typeof serviceabilityResponseSchema>;

// ── Create Order ──────────────────────────────────────────────────────────────

export const createOrderResponseSchema = z.object({
  order_id: z.union([z.number(), z.string()]),
  channel_order_id: z.string().nullable().optional(),
  shipment_id: z.union([z.number(), z.string()]).nullable().optional(),
  status: z.string().optional(),
  status_code: z.number().optional(),
});

export type CreateOrderResponse = z.infer<typeof createOrderResponseSchema>;

// ── Assign AWB ────────────────────────────────────────────────────────────────

export const assignAwbResponseSchema = z.object({
  awb_assign_status: z.number().optional(),
  response: z
    .object({
      data: z
        .object({
          awb_code: z.string().optional(),
          courier_name: z.string().optional(),
          courier_company_id: z.union([z.number(), z.string()]).optional(),
          shipment_id: z.union([z.number(), z.string()]).optional(),
        })
        .optional(),
    })
    .optional(),
  /** Top-level fields when nested structure not present */
  awb_code: z.string().optional(),
  courier_name: z.string().optional(),
  shipment_id: z.union([z.number(), z.string()]).optional(),
});

export type AssignAwbResponse = z.infer<typeof assignAwbResponseSchema>;

// ── Track ─────────────────────────────────────────────────────────────────────

const trackingActivitySchema = z.object({
  date: z.string(),
  activity: z.string(),
  location: z.string().optional().nullable(),
  sr_status_label: z.string().optional(),
});

export const trackResponseSchema = z.object({
  tracking_data: z.object({
    shipment_track: z
      .array(
        z.object({
          awb_code: z.string().optional(),
          current_status: z.string().optional(),
        }),
      )
      .optional(),
    shipment_track_activities: z.array(trackingActivitySchema).optional(),
    track_url: z.string().optional().nullable(),
  }),
});

export type TrackResponse = z.infer<typeof trackResponseSchema>;

// ── Cancel ────────────────────────────────────────────────────────────────────

export const cancelOrderResponseSchema = z.object({
  message: z.string().optional(),
  status_code: z.number().optional(),
});

export type CancelOrderResponse = z.infer<typeof cancelOrderResponseSchema>;

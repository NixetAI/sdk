import { z } from "zod";

/**
 * Billing: what a workspace is allowed, and what it has used.
 *
 * An organization exists in the identity provider, which owns identity. The row here is the
 * part that is ours — a plan, a counter, and eventually a Stripe customer —
 * created the first time we see a workspace rather than at signup, because
 * signup is a flow we do not own.
 *
 * A run is the billable unit. Not tokens, which are the provider's unit, and
 * not seats, which would charge for the second person to look at a failure.
 */

export const planSchema = z.enum(["free", "pro", "scale", "enterprise"]);
export type Plan = z.infer<typeof planSchema>;

/**
 * What each plan includes.
 *
 * `runsIncluded` is copied onto the organization when the plan is set, so a
 * negotiated enterprise allowance is a column rather than a special case in
 * code. These are the defaults, not the authority.
 *
 * `overage` is null where there is none: Free is a wall, Enterprise is a
 * committed rate with no wall at all. Stopping an enterprise customer's
 * production traffic over a counter is a support incident, not a control.
 */
export const PLANS: Record<
  Plan,
  {
    runsIncluded: number;
    /** USD per thousand runs beyond the allowance, or null for no overage. */
    overagePerThousand: number | null;
    /** Days a trace is kept. */
    retentionDays: number;
    /** What managed inference is marked up by. BYO key is never marked up. */
    inferenceMarkup: number;
    monthlyUsd: number | null;
  }
> = {
  free: {
    runsIncluded: 1_000,
    overagePerThousand: null,
    retentionDays: 7,
    inferenceMarkup: 0,
    monthlyUsd: 0,
  },
  pro: {
    runsIncluded: 25_000,
    overagePerThousand: 2,
    retentionDays: 90,
    inferenceMarkup: 0.15,
    monthlyUsd: 29,
  },
  scale: {
    runsIncluded: 500_000,
    overagePerThousand: 1.2,
    retentionDays: 365,
    inferenceMarkup: 0.08,
    monthlyUsd: 249,
  },
  enterprise: {
    runsIncluded: Number.MAX_SAFE_INTEGER,
    overagePerThousand: null,
    retentionDays: 365,
    inferenceMarkup: 0,
    monthlyUsd: null,
  },
};

/** Whether a plan stops at its allowance or bills past it. */
export function isHardLimit(plan: Plan): boolean {
  return PLANS[plan].overagePerThousand === null && plan !== "enterprise";
}

export const organizationSchema = z.object({
  id: z.string().describe("The workspace identifier, as identity reports it."),
  plan: planSchema,
  /** Copied from the plan when it is set, so a negotiated rate is a value. */
  runs_included: z.number(),
  /** When the current period began. Not a calendar month: the plan's own date. */
  period_start: z.string(),
  period_end: z.string(),
  /** Null until they pay. */
  stripe_customer_id: z.string().nullable(),
  stripe_subscription_id: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type Organization = z.infer<typeof organizationSchema>;

/**
 * What a workspace has used this period.
 *
 * `runs_used` is incremented as runs finish rather than counted on demand:
 * admission has to answer on every request, and a count over the runs table is
 * a scan of the busiest thing we have. `usage_events` is what makes that
 * honest — the counter is a cache of a sum that can always be rebuilt.
 */
export const periodUsageSchema = z.object({
  plan: planSchema,
  period_start: z.string(),
  period_end: z.string(),
  runs_used: z.number(),
  runs_included: z.number(),
  /** What the runs cost us in inference, before any markup. */
  cost_usd: z.number(),
  /** Runs past the allowance, zero when within it. */
  overage_runs: z.number(),
  /** What the overage will add to the invoice. */
  overage_usd: z.number(),
  /** Whether a further run would be refused. */
  at_limit: z.boolean(),
});
export type PeriodUsage = z.infer<typeof periodUsageSchema>;

/**
 * What the overage costs, given a plan and how many runs were used.
 *
 * Charged per thousand and rounded up, which is how the plans are written: a
 * single run past the allowance costs the first thousand's price. Returns zero
 * where the plan has no overage, because there the answer is a refusal rather
 * than a charge.
 */
export function overageFor(plan: Plan, runsUsed: number, runsIncluded: number): {
  runs: number;
  usd: number;
} {
  const over = Math.max(0, runsUsed - runsIncluded);
  const rate = PLANS[plan].overagePerThousand;
  if (over === 0 || rate === null) return { runs: over, usd: 0 };
  return { runs: over, usd: Math.ceil(over / 1_000) * rate };
}

/** Whether another run may start. */
export function withinAllowance(
  plan: Plan,
  runsUsed: number,
  runsIncluded: number,
): boolean {
  if (!isHardLimit(plan)) return true;
  return runsUsed < runsIncluded;
}

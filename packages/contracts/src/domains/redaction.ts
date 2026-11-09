import { z } from "zod";

/**
 * Redaction.
 *
 * Personal data is masked in Nixet before a run is dispatched, so the runtime
 * and the model provider receive `[GIVEN_NAME_1]` where a name was. When the
 * policy is reversible the map is sealed in the vault and the reply is restored
 * on the way back out, so the caller still reads a normal answer.
 *
 * Scope is deliberately narrow: run input and output only. Tool arguments and
 * results recorded in the trace are **not** redacted, because the trace is what
 * the product is for. Anything describing this feature has to say so.
 */

/**
 * Detection categories, as the model reports them.
 *
 * `ORG` is a company rather than a person, so it is excluded unless a caller
 * asks for it. `IMEI` and the other structured labels are checksum-validated.
 */
export const redactionLabelSchema = z.enum([
  "GIVEN_NAME",
  "SURNAME",
  "STREET_NAME",
  "BUILDING_NUMBER",
  "SECONDARY_ADDRESS",
  "CITY",
  "STATE",
  "ZIP_CODE",
  "EMAIL",
  "PHONE",
  "CREDIT_CARD",
  "BANK_ACCOUNT",
  "ROUTING_NUMBER",
  "IP_ADDRESS",
  "URL",
  "GOVERNMENT_ID",
  "PASSPORT",
  "DRIVERS_LICENSE",
  "TAX_ID",
  "SSN",
  "IMEI",
  "ORG",
]);
export type RedactionLabel = z.infer<typeof redactionLabelSchema>;

/**
 * How much to mask.
 *
 * A mode is all a caller needs; `labels` exists for the rare case where one
 * specific category matters and the rest do not.
 *
 * | mode         | masks                                              |
 * | ------------ | -------------------------------------------------- |
 * | `off`        | nothing                                            |
 * | `structured` | only checksum-validated identifiers                |
 * | `standard`   | every personal category                            |
 * | `strict`     | every category, including the company someone works for |
 *
 * `structured` is the only mode whose detections are all checksum-validated —
 * cards against Luhn, IBANs against ISO-13616, national IDs against their own
 * country's rule. Nothing in it depends on the model guessing, and the agent
 * still sees names, so it still works normally.
 *
 * `standard` is the one to reach for: it covers everything that identifies a
 * person. `strict` adds `ORG`, which is a company rather than a person, so it
 * is separate rather than included by default.
 */
export const redactionModeSchema = z.enum(["off", "structured", "standard", "strict"]);
export type RedactionMode = z.infer<typeof redactionModeSchema>;

/** Deterministic labels: every one of these has to pass a real checksum. */
export const STRUCTURED_LABELS: readonly RedactionLabel[] = [
  "CREDIT_CARD",
  "BANK_ACCOUNT",
  "ROUTING_NUMBER",
  "GOVERNMENT_ID",
  "PASSPORT",
  "DRIVERS_LICENSE",
  "TAX_ID",
  "SSN",
  "IMEI",
];

/** Everything a person is, excluding the company they work for. */
export const STANDARD_LABELS: readonly RedactionLabel[] = redactionLabelSchema.options.filter(
  (label) => label !== "ORG",
);

export const STRICT_LABELS: readonly RedactionLabel[] = redactionLabelSchema.options;

/** The labels a mode masks. `labels` on the policy overrides this. */
export function labelsForMode(mode: RedactionMode): readonly RedactionLabel[] {
  if (mode === "structured") return STRUCTURED_LABELS;
  if (mode === "standard") return STANDARD_LABELS;
  if (mode === "strict") return STRICT_LABELS;
  return [];
}

/** How long a reversible map is kept before it is destroyed. */
export const retentionSchema = z.enum(["1h", "24h", "7d", "30d"]);
export type Retention = z.infer<typeof retentionSchema>;

export const RETENTION_MS: Record<Retention, number> = {
  "1h": 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

/**
 * A version's redaction policy.
 *
 * Lives on the version rather than the agent, so it is immutable, hashed into
 * the digest and pinned per run. Changing it is a new version, exactly like
 * changing the instructions.
 */
export const redactionPolicySchema = z
  .object({
    mode: redactionModeSchema.default("off"),
    /**
     * Keep the placeholder map so the reply can be restored.
     *
     * Off by default. A reversible run stores the real values, encrypted, for
     * as long as `retain_for`; an irreversible one keeps nothing, so there is
     * nothing to leak and nothing to erase.
     */
    reversible: z.boolean().default(false),
    /**
     * Neural confidence floor, `0..1`.
     *
     * Only affects model-inferred labels such as names and cities. The
     * structured labels are checksum-validated and always apply. Raise this to
     * over-mask less; lowering it will not surface a detection the model did
     * not make.
     */
    minimum_confidence: z.number().min(0).max(1).default(0.6),
    /**
     * Narrows the mode to these categories.
     *
     * Rarely needed: a mode already covers a sensible set. This is for the case
     * where a caller wants cards masked and nothing else.
     */
    labels: z.array(redactionLabelSchema).min(1).max(22).optional(),
    retain_for: retentionSchema.default("24h"),
  })
  .strict()
  .refine((policy) => policy.mode !== "off" || !policy.reversible, {
    message: "reversible requires a redaction mode other than off.",
    path: ["reversible"],
  });
export type RedactionPolicy = z.infer<typeof redactionPolicySchema>;

export const REDACTION_OFF: RedactionPolicy = {
  mode: "off",
  reversible: false,
  minimum_confidence: 0.6,
  retain_for: "24h",
};

/**
 * What a run reports about its own redaction.
 *
 * Counts per label, never the values: the masked values are the personal data
 * that was just removed, and storing them beside the masked copy would produce
 * a labelled index of every sensitive item in the run.
 */
export const redactionSummarySchema = z.object({
  mode: redactionModeSchema,
  reversible: z.boolean(),
  /** Detections per label, e.g. `{ "EMAIL": 2, "GIVEN_NAME": 3 }`. */
  counts: z.record(redactionLabelSchema, z.number().int().positive()),
  item_count: z.number().int().nonnegative(),
  /** When the stored map is destroyed. Null when the run kept none. */
  expires_at: z.string().nullable(),
});
export type RedactionSummary = z.infer<typeof redactionSummarySchema>;

/**
 * Groq Client Abstraction — Milestone 4
 *
 * Defines the GroqDraftClient interface that tests can mock deterministically,
 * and provides a factory function that creates the real groq-sdk client.
 *
 * SECURITY:
 *   - API key is read exclusively from process.env.GROQ_API_KEY.
 *   - The key is NEVER logged, included in error messages, or returned.
 *   - If the key is absent, the factory returns an error (fail-closed).
 *
 * MODEL SELECTION:
 *   - Controlled by process.env.GROQ_MODEL.
 *   - Default: llama-3.3-70b-versatile
 *   - The model is never hardcoded throughout the rest of the codebase.
 *
 * This module does NOT accept multiple LLM providers.
 * It is scoped exclusively to Groq.
 */

import Groq from "groq-sdk";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Default Groq model — configurable via GROQ_MODEL env var. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-20b";

/** Default temperature — configurable via GROQ_TEMPERATURE env var. */
export const DEFAULT_TEMPERATURE = 0.1;

/** Default timeout in ms — configurable via GROQ_TIMEOUT_MS env var. */
export const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Strict JSON Schema for Groq Strict Structured Outputs.
 *
 * Groq strict requirements:
 *   - all fields must be listed in `required`
 *   - `additionalProperties: false`
 *   - nullable union types (`type: ["string", "null"]`) for optional semantic fields
 */
export const DISPUTE_RESPONSE_DRAFT_SCHEMA = {
  name: "dispute_response_draft",
  strict: true,
  schema: {
    type: "object",
    properties: {
      transaction_id: { type: "string" },
      user_id: { type: "string" },
      transaction_date: { type: "string" },
      amount: { type: "number" },
      currency: { type: "string" },
      tos_version: { type: ["string", "null"] },
      tos_accepted_at: { type: ["string", "null"] },
      consumption_resource: { type: ["string", "null"] },
      consumption_timestamp: { type: ["string", "null"] },
      transaction_ip: { type: ["string", "null"] },
      narrative: { type: "string" },
    },
    required: [
      "transaction_id",
      "user_id",
      "transaction_date",
      "amount",
      "currency",
      "tos_version",
      "tos_accepted_at",
      "consumption_resource",
      "consumption_timestamp",
      "transaction_ip",
      "narrative",
    ],
    additionalProperties: false,
  },
} as const;

/** Resolve the model identifier from environment or default. */
export function resolveModel(): string {
  return process.env["GROQ_MODEL"] ?? DEFAULT_GROQ_MODEL;
}

/** Resolve temperature from environment or default. */
export function resolveTemperature(): number {
  const raw = process.env["GROQ_TEMPERATURE"];
  if (raw !== undefined) {
    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_TEMPERATURE;
}

/** Resolve timeout from environment or default. */
export function resolveTimeoutMs(): number {
  const raw = process.env["GROQ_TIMEOUT_MS"];
  if (raw !== undefined) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed)) return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

// ---------------------------------------------------------------------------
// Client interface — enables deterministic mock substitution in tests
// ---------------------------------------------------------------------------

/**
 * Minimal interface for generating a dispute-response draft.
 * Production implementation wraps groq-sdk.
 * Test implementation uses deterministic mock responses.
 *
 * Responsibilities:
 *   - Accept a system instruction string and a data message string.
 *   - Return the raw response text (expected to be valid JSON).
 *   - Throw on network error, timeout, or empty response.
 *
 * The interface is intentionally narrow — it does NOT expose model config
 * details or request structure to the caller. Those are encapsulated here.
 */
export interface GroqDraftClient {
  /**
   * Send a drafting request to the bounded LLM.
   *
   * @param systemInstruction - strict application-level constraints
   * @param dataMessage - serialised verified evidence (data only, not instructions)
   * @returns raw response content (expected JSON string)
   * @throws on API error, timeout, or empty response
   */
  generateDraft(systemInstruction: string, dataMessage: string): Promise<string>;

  /** Model identifier being used (for audit logging) */
  readonly modelId: string;

  /** Temperature being used (for audit logging) */
  readonly temperature: number;
}

// ---------------------------------------------------------------------------
// Production client — wraps groq-sdk
// ---------------------------------------------------------------------------

export type ClientCreateResult =
  | { ok: true; client: GroqDraftClient }
  | { ok: false; reason: "MISSING_API_KEY" | "CONFIG_ERROR"; detail: string };

/**
 * Create the production Groq client.
 *
 * Reads GROQ_API_KEY from process.env. Returns ok:false if absent.
 * The API key is NEVER returned, logged, or included in error messages.
 *
 * Fail-closed: callers that receive ok:false must route to MANUAL_REVIEW.
 */
export function createGroqClient(): ClientCreateResult {
  const apiKey = process.env["GROQ_API_KEY"];
  if (!apiKey || apiKey.trim() === "" || apiKey === "your_groq_api_key_here") {
    return {
      ok: false,
      reason: "MISSING_API_KEY",
      detail: "GROQ_API_KEY environment variable is not set or is a placeholder. Cannot create LLM drafting client.",
    };
  }

  const modelId = resolveModel();
  const temperature = resolveTemperature();
  const timeoutMs = resolveTimeoutMs();

  try {
    const groq = new Groq({
      apiKey,
      timeout: timeoutMs,
    });

    const client: GroqDraftClient = {
      modelId,
      temperature,

      async generateDraft(systemInstruction: string, dataMessage: string): Promise<string> {
        const completion = await groq.chat.completions.create({
          model: modelId,
          temperature,
          response_format: {
            type: "json_schema",
            json_schema: DISPUTE_RESPONSE_DRAFT_SCHEMA,
          },
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: dataMessage },
          ],
        });

        const content = completion.choices[0]?.message?.content;
        if (!content || content.trim() === "") {
          throw new Error("Groq returned an empty response — failing closed");
        }
        return content;
      },
    };

    return { ok: true, client };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      reason: "CONFIG_ERROR",
      detail: `Failed to initialise Groq client: ${msg}`,
    };
  }
}

/**
 * Application-Level Append-Only Audit Log — Milestone 5
 *
 * Source of truth: docs/PRD.md §7, docs/ARCHITECTURE.md §7, docs/DATA_MODEL.md §4
 *
 * Requirements:
 *   - Application-level append-only audit log.
 *   - Only `append` and `retrieve` operations are exposed.
 *   - NO `update` or `delete` APIs exist.
 *   - Captures all key workflow events, state transitions, evidence verification results,
 *     LLM requests, generated outputs, validation outcomes, and human approval events.
 *   - REJECTED LLM OUTPUT RULE: Invalid LLM outputs are excluded from the final evidence package,
 *     but retained in the append-only audit log for traceability.
 *   - Exact semantic string:
 *     "The invalid output is excluded from the final evidence package and cannot progress through the workflow; the rejected output is retained in the append-only audit log for traceability."
 *   - SECURITY: No secret keys (GROQ_API_KEY), headers, or authorization tokens are ever logged.
 */

import type { AuditLogEntry, LLMPromptMetadata, HumanAction } from "../schemas/index.js";

/** Exact required semantic string for rejected drafts */
export const REJECTED_DRAFT_AUDIT_SEMANTIC =
  "The invalid output is excluded from the final evidence package and cannot progress through the workflow; the rejected output is retained in the append-only audit log for traceability.";

/** Input payload for appending a new log entry */
export interface CreateAuditLogEntryInput {
  dispute_id: string;
  event_type: string;
  previous_state: string;
  next_state: string;
  verified_evidence_snapshot?: Record<string, unknown>;
  llm_prompt_metadata?: LLMPromptMetadata;
  llm_output?: string;
  validation_result?: { passed: boolean; reason?: string };
  human_action?: HumanAction;
  failure_reason?: string;
  timestamp?: string;
}

/**
 * Class representing an isolated application-level append-only audit logger instance.
 *
 * Invariant:
 *   - Append and Retrieve ONLY.
 *   - No update, modify, or delete methods exist.
 *   - Preserves strict chronological insertion order.
 */
export class AuditLogger {
  private readonly entries: AuditLogEntry[] = [];
  private sequenceCounter = 0;

  /**
   * Append a new entry to the application audit log.
   *
   * @param input Entry data to append
   * @returns The appended immutable AuditLogEntry
   */
  public append(input: CreateAuditLogEntryInput): AuditLogEntry {
    this.sequenceCounter += 1;
    const logId = `aud_${Date.now()}_${String(this.sequenceCounter).padStart(4, "0")}`;
    const timestamp = input.timestamp ?? new Date().toISOString();

    // Sanitize llm_output or fields to ensure no API keys or secrets leak
    const sanitizedOutput = input.llm_output ? this.sanitizeSecrets(input.llm_output) : undefined;
    const sanitizedReason = input.failure_reason ? this.sanitizeSecrets(input.failure_reason) : undefined;

    const entry: AuditLogEntry = {
      log_id: logId,
      dispute_id: input.dispute_id,
      timestamp,
      event_type: input.event_type,
      previous_state: input.previous_state,
      next_state: input.next_state,
    };

    if (input.verified_evidence_snapshot !== undefined) {
      entry.verified_evidence_snapshot = input.verified_evidence_snapshot;
    }
    if (input.llm_prompt_metadata !== undefined) {
      entry.llm_prompt_metadata = input.llm_prompt_metadata;
    }
    if (sanitizedOutput !== undefined) {
      entry.llm_output = sanitizedOutput;
    }
    if (input.validation_result !== undefined) {
      entry.validation_result = input.validation_result;
    }
    if (input.human_action !== undefined) {
      entry.human_action = input.human_action;
    }
    if (sanitizedReason !== undefined) {
      entry.failure_reason = sanitizedReason;
    }

    // Freeze object to enforce immutability in runtime memory
    const frozen = Object.freeze(entry);
    this.entries.push(frozen);
    return frozen;
  }

  /**
   * Retrieve all audit entries for a specific dispute ID in chronological order.
   */
  public getEntriesForDispute(disputeId: string): readonly AuditLogEntry[] {
    return this.entries.filter((e) => e.dispute_id === disputeId);
  }

  /**
   * Retrieve all recorded audit entries across all disputes in chronological order.
   */
  public getAllEntries(): readonly AuditLogEntry[] {
    return [...this.entries];
  }

  /**
   * Sanitizes secret keys if inadvertently passed in text.
   */
  private sanitizeSecrets(text: string): string {
    if (process.env["GROQ_API_KEY"]) {
      text = text.replaceAll(process.env["GROQ_API_KEY"], "[REDACTED_API_KEY]");
    }
    return text.replace(/gsk_[a-zA-Z0-9_-]+/g, "[REDACTED_GROQ_KEY]");
  }
}

/** Global default audit logger singleton for application-wide use */
export const globalAuditLogger = new AuditLogger();

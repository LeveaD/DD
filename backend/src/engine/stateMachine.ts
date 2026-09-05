/**
 * Dispute State Machine — Milestone 3
 *
 * Implements the deterministic state machine from ARCHITECTURE.md §2.
 *
 * Rules:
 *   - Every transition is explicit and validated.
 *   - Invalid transitions are rejected with a structured error.
 *   - The LLM has zero authority to trigger transitions (enforced by type system:
 *     callers must hold a reference to this module to call transition()).
 *   - All terminal states (SUBMITTED, MANUAL_REVIEW) reject further transitions
 *     from the automated pipeline.
 *
 * Valid transition table (from ARCHITECTURE.md §2 State Catalog):
 *   RECEIVED                → EVIDENCE_FETCHING | MANUAL_REVIEW
 *   EVIDENCE_FETCHING       → EVIDENCE_VERIFIED  | MANUAL_REVIEW
 *   EVIDENCE_VERIFIED       → SUFFICIENCY_ASSESSED | MANUAL_REVIEW
 *   SUFFICIENCY_ASSESSED    → RESPONSE_DRAFTED   | MANUAL_REVIEW
 *   RESPONSE_DRAFTED        → RESPONSE_VALIDATED | RESPONSE_VALIDATION_FAILED | MANUAL_REVIEW
 *   RESPONSE_VALIDATED      → HUMAN_APPROVAL_REQUIRED | MANUAL_REVIEW
 *   HUMAN_APPROVAL_REQUIRED → READY_FOR_SUBMISSION | MANUAL_REVIEW
 *   READY_FOR_SUBMISSION    → SUBMITTED | MANUAL_REVIEW
 *   RESPONSE_VALIDATION_FAILED → MANUAL_REVIEW
 *   SUBMITTED               → (terminal — no further automated transitions)
 *   MANUAL_REVIEW           → (terminal for automated pipeline)
 */

import type { DisputeState } from "../schemas/index.js";

// ---------------------------------------------------------------------------
// Allowed transitions table
// ---------------------------------------------------------------------------

/** Immutable map from state → set of valid next states */
const ALLOWED_TRANSITIONS: ReadonlyMap<DisputeState, ReadonlySet<DisputeState>> = new Map([
  ["RECEIVED",                  new Set<DisputeState>(["EVIDENCE_FETCHING", "MANUAL_REVIEW"])],
  ["EVIDENCE_FETCHING",         new Set<DisputeState>(["EVIDENCE_VERIFIED", "MANUAL_REVIEW"])],
  ["EVIDENCE_VERIFIED",         new Set<DisputeState>(["SUFFICIENCY_ASSESSED", "MANUAL_REVIEW"])],
  ["SUFFICIENCY_ASSESSED",      new Set<DisputeState>(["RESPONSE_DRAFTED", "MANUAL_REVIEW"])],
  ["RESPONSE_DRAFTED",          new Set<DisputeState>(["RESPONSE_VALIDATED", "RESPONSE_VALIDATION_FAILED", "MANUAL_REVIEW"])],
  ["RESPONSE_VALIDATED",        new Set<DisputeState>(["HUMAN_APPROVAL_REQUIRED", "MANUAL_REVIEW"])],
  ["HUMAN_APPROVAL_REQUIRED",   new Set<DisputeState>(["READY_FOR_SUBMISSION", "MANUAL_REVIEW"])],
  ["READY_FOR_SUBMISSION",      new Set<DisputeState>(["SUBMITTED", "MANUAL_REVIEW"])],
  ["RESPONSE_VALIDATION_FAILED",new Set<DisputeState>(["MANUAL_REVIEW"])],
  ["SUBMITTED",                 new Set<DisputeState>()],  // terminal
  ["MANUAL_REVIEW",             new Set<DisputeState>()],  // terminal for automated pipeline
]);

// ---------------------------------------------------------------------------
// Transition result
// ---------------------------------------------------------------------------

export type TransitionResult =
  | { ok: true; previousState: DisputeState; newState: DisputeState }
  | { ok: false; error: TransitionError };

export interface TransitionError {
  kind: "INVALID_TRANSITION" | "TERMINAL_STATE";
  from: DisputeState;
  attempted: DisputeState;
  message: string;
  allowedNextStates: DisputeState[];
}

// ---------------------------------------------------------------------------
// State machine functions
// ---------------------------------------------------------------------------

/**
 * Return the set of valid next states for a given current state.
 * Returns an empty set for terminal states.
 */
export function allowedNextStates(current: DisputeState): DisputeState[] {
  return [...(ALLOWED_TRANSITIONS.get(current) ?? new Set<DisputeState>())];
}

/**
 * Check whether a transition from → to is valid.
 */
export function isValidTransition(from: DisputeState, to: DisputeState): boolean {
  return ALLOWED_TRANSITIONS.get(from)?.has(to) ?? false;
}

/**
 * Perform a validated state transition.
 *
 * Returns ok:true with the new state if the transition is valid.
 * Returns ok:false with a structured TransitionError if the transition is invalid.
 *
 * Fail-closed: any unexpected state or attempted skip routes to MANUAL_REVIEW
 * rather than silently accepting an invalid transition.
 */
export function transition(
  current: DisputeState,
  next: DisputeState,
): TransitionResult {
  const allowed = ALLOWED_TRANSITIONS.get(current);

  if (allowed === undefined) {
    // Unknown current state — programming error, fail closed
    return {
      ok: false,
      error: {
        kind: "INVALID_TRANSITION",
        from: current,
        attempted: next,
        message: `Unknown state "${current}" — this is a programming error`,
        allowedNextStates: [],
      },
    };
  }

  if (allowed.size === 0) {
    return {
      ok: false,
      error: {
        kind: "TERMINAL_STATE",
        from: current,
        attempted: next,
        message: `State "${current}" is terminal — no further automated transitions are allowed`,
        allowedNextStates: [],
      },
    };
  }

  if (!allowed.has(next)) {
    return {
      ok: false,
      error: {
        kind: "INVALID_TRANSITION",
        from: current,
        attempted: next,
        message: `Invalid transition: "${current}" → "${next}"`,
        allowedNextStates: [...allowed],
      },
    };
  }

  return { ok: true, previousState: current, newState: next };
}

/**
 * Returns true if the state is a terminal state for the automated pipeline.
 * Terminal states: SUBMITTED, MANUAL_REVIEW
 */
export function isTerminalState(state: DisputeState): boolean {
  const allowed = ALLOWED_TRANSITIONS.get(state);
  return allowed !== undefined && allowed.size === 0;
}

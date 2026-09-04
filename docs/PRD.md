## DisputeDefend AI

Product Requirements Document v3.0

PROGRAM

Razorpay AI Buildathon 2026

TRACK

CORE PARADIGM

STATUS

02 — AI Risk Manager

Evidence-First Defensive Routing

Final Implementation Draft

## 1. PRODUCT OVERVIEW

## Elevator Pitch

DisputeDefend AI is a structured evidence and response-drafting assistant for digital merchants. It deterministically retrieves user telemetry (login IPs, post-purchase consumption, terms of service acceptance) when a chargeback webhook is received. It assesses evidence sufficiency, uses a bounded LLM exclusively to draft a factual response narrative from verified data, and requires human approval before simulating submission. Cases with insufficient evidence are safely routed to manual review.

## Problem Statement

Merchants facing friendly fraud lose revenue because manually compiling scattered telemetry evidence into a readable dispute response is highly time-consuming. However, fully automating dispute fighting is unsafe; systems that invent evidence or make unsupported legal determinations introduce severe operational and compliance risks.

## Solution Architecture

A defensive workflow that separates deterministic evidence verification from AI narrative generation. The system assists dispute operations by automating data retrieval and drafting, optimizing analyst time without making unsupported legal determinations or claiming definitive fraud certainty.

## 2. INTEGRATION BOUNDARIES (REAL VS. SYNTHETIC VS. SIMULATED)

To maintain absolute transparency and technical credibility during the hackathon, system boundaries are strictly defined:

## • REAL:

- Webhook receiver (parsing standard incoming JSON payloads).

- Deterministic routing logic and evidence verification engine.

- Gemini API invocation for text drafting.

- Post-generation hard validator.

- PDF compilation engine.

## • SYNTHETIC:

- Merchant transaction database.

- User telemetry records (IP logs, session history, post-purchase activity, TOS records).

- The 150-case evaluation dataset (generated via a reproducible random seed script).


## • SIMULATED:

- Final external dispute submission. The system generates the formatted evidence package and logs its internal state as SUBMITTED, but no external banking/network API is actually called.

## 3. EVIDENCE SEMANTICS & ROUTING POLICY

Evidence points are treated strictly as supporting signals, not as definitive proof of customer identity, fraud, or legal liability.

## Evidence Definitions

- IP Match / Device Consistency: A supporting consistency signal. An IP match may be weakened by NAT, VPNs, or shared networks, and therefore does not constitute absolute identity proof.

- Post-Purchase Consumption: Evidence that a product was used or downloaded, not proof of fraudulent intent.

- TOS Acceptance: Evidence that terms were accepted at a specific timestamp, not proof that a specific dispute is legally invalid.

## Deterministic Routing Policy (Evidence Sufficiency)

The routing engine evaluates evidence sufficiency and consistency, not fraud certainty.

- Strong Evidence (Identity Match + IP Consistency + Post-Purchase Consumption): Route to RESPONSE_DRAFTED → HUMAN_APPROVAL_REQUIRED.

- Partial/Contradictory Evidence (Identity Match, but mismatched IPs or missing consumption): Route directly to MANUAL_REVIEW.

- Insufficient Evidence (Missing identity/telemetry): Route directly to MANUAL_REVIEW.

## 4. STATE MACHINE & AI BOUNDARIES

The system operates on an auditable, application-controlled state machine to guarantee bounded behavior. The LLM has zero authority to change state, alter source evidence, approve its own output, or trigger submissions.

- 1. RECEIVED: Webhook payload parsed.

- 2. EVIDENCE_FETCHING: Querying synthetic merchant DB.

- 3. EVIDENCE_VERIFIED: Deterministic verification of timestamps and signals.

- 4. SUFFICIENCY_ASSESSED: Case evaluated against routing policy.

- Branch A (Sufficient): RESPONSE_DRAFTED → RESPONSE_VALIDATED → HUMAN_APPROVAL_REQUIRED → (Analyst Action) → READY_FOR_SUBMISSION → SUBMITTED.

- Branch B (Insufficient/Contradictory): MANUAL_REVIEW.

- Branch C (Validator Rejection): RESPONSE_VALIDATION_FAILED → MANUAL_REVIEW.


## 5. FAILURE MODEL & SAFETY MECHANISMS

The system strictly adheres to the principle of preferring a false negative (routing to a human) over unsafe automated progression.

- Failure A — Missing Evidence: Deterministic engine finds missing telemetry. System safely bypasses the LLM entirely and routes to MANUAL_REVIEW.

- Failure B — Contradictory Evidence: Deterministic engine detects conflicting signals (e.g., usage timestamp precedes purchase timestamp). Routes to MANUAL_REVIEW.

- Failure C — Unsupported AI Claim: The LLM generates a draft, but the Post-Generation Validator detects an entity (date, IP, amount) not present in the verified database snapshot. Output is rejected. Routes to RESPONSE_VALIDATION_FAILED → MANUAL_REVIEW.

- Failure D — System/Validator Crash: If the validation layer itself fails to execute or crashes, the system fails closed. Routes to MANUAL_REVIEW. The invalid output is excluded from the final evidence package and cannot progress through the workflow; the rejected output is retained in the append-only audit log for traceability.

## 6. EVALUATION FRAMEWORK (TWO INDEPENDENT BENCHMARKS)

To prevent conflating routing decisions with LLM safety, evaluation is strictly separated into two domains.

## Evaluation A: Evidence Routing Performance

Purpose: Measures whether the deterministic system correctly routes disputes based on evidence sufficiency.

Dataset: 150 synthetic dispute cases generated via a reproducible random seed (seed = 42). 70% Development, 30% Held-Out Evaluation set. The evaluation set is strictly independent of demo cases.

Ground Truth Definition: Whether the evidence available to the merchant is sufficient for the defined operational routing policy. (This is not a measurement of customer guilt or legal truth).

| GROUND TRUTH | SYSTEM OUTCOME | CLASSIFICATION |
| --- | --- | --- |
| DEFENDABLE | Response generated / eligible for human approval | True Positive |
| DEFENDABLE | Routed to Manual review / no response generated | False Negative |
| NOT_DEFENDABLE | Routed to Manual review / blocked from AI generation | True Negative |
| NOT_DEFENDABLE | Response generated / eligible for human approval | False Positive |

## Measured Metrics (on Holdout Set):

- Precision: TP / (TP + FP).

- Recall: TP / (TP + FN).

- F1 Score: Harmonic mean of Precision and Recall.

- False Positive Rate / Cost: Sending insufficient evidence to approval. Cost = wasted analyst time + operational risk.

- False Negative Rate / Cost: Sending sufficient evidence to manual review. Cost = manual compilation time + backlog risk.


## Evaluation B: LLM Output Safety

Purpose: Measures whether the post-generation validator detects unsupported AI-generated claims.

Dataset: A controlled test-harness of 100 valid LLM outputs and 100 explicitly injected invalid outputs (e.g., hallucinated IP

addresses, altered amounts).

## Measured Metrics:

- Unsupported-Claim Detection Rate: Percentage of injected hallucinations correctly caught and rejected by the validator.

- False Acceptance Rate: Percentage of injected hallucinations that bypassed the validator (Target: 0%).

- Validation Pass Rate: Percentage of genuinely valid drafts successfully passed.

## 7. AUDITABILITY & DATABASE DESIGN

The application utilizes an application-level append-only audit log. There are no update or delete operations for historical audit entries, ensuring traceability without overengineering cryptographic claims.

## Audit Event Schema:

- timestamp: ISO-8601 execution time.

- event_type: State transition or human action.

- previous_state & next_state

- deterministic_snapshot: JSON reference of the exact database evidence used.

- llm_prompt_metadata: Model version and parameters.

- llm_output: Raw text generated.

- validation_result: Pass/Fail + specific rejection reason.

- human_action: Analyst ID and approval/rejection timestamp.

- failure_reason: Explicit categorization if routed to manual review.

## 8. UI / DASHBOARD LANGUAGE & UX

The UI strictly avoids labels implying unearned certainty.

- Command Center Labels: Queue States: Human Review Required, Manual Compilation Queue, Ready for Submission. Metrics Panel: Evaluation A: Routing Recall, Evaluation B: Validator Detection Rate.

- Evidence Inspector Labels: Evidence Sufficiency Assessment, Supporting Signals Checklist, Missing/Contradictory Evidence, AI Draft (Clearly watermarked as AI-generated), Validation Passed / Failed.


## 9. END-TO-END WORKFLOW & DEMO SCRIPT (3-5 MINUTES)

The demo proves the system’s bounded nature through three controlled scenarios.

## • Scenario 1: Strong Evidence (Success Path)

Action: Ingest standard JSON webhook payload.

System: Deterministically finds matching IP and usage logs. Assesses sufficiency. AI drafts text. Validator passes text. UI: Analyst reviews the AI draft summarizing verified facts. Analyst clicks "Approve". Structured evidence package is generated.

## • Scenario 2: Missing Evidence (Failure A Recovery)

Action: Ingest webhook for a transaction missing user telemetry.

System: Sufficiency evaluation fails. Bypasses LLM entirely. State transitions to MANUAL_REVIEW. UI: Dashboard shows "Insufficient Evidence. Auto-draft disabled." (Demonstrates AI judgment: knowing when not to use AI).

## • Scenario 3: Validator Fault Injection (Failure C Recovery)

Action: Activate a controlled test-harness that injects a corrupted draft (e.g., changing purchase date from 2026-09-01 to 2026-09-05). Explicitly state to judges that this is a fault-injection test, not production LLM behavior. System: Post-Generation Validator detects the date mismatch against the deterministic snapshot. Draft is rejected. State transitions to RESPONSE_VALIDATION_FAILED.

UI: Audit trail explicitly shows the rejected claim. UI falls back to a deterministic template and requires MANUAL_REVIEW.

## 10. REQUIREMENTS TRACEABILITY TABLE

|   | RAZORPAY JUDGING HOW DISPUTEDEFEND DEMONSTRATES EVIDENCE SHOWN IN DEMO REQUIREMENT IT Problem Taste Solves high-cost friendly fraud compilation UI focusing on evidence sufficiency and without assuming unsafe legal authority. analyst time-saving. Build Quality Explicit state machine, validation layer, and Audit timeline tracing every transition and append-only audit logging. data snapshot. AI Judgment LLM only drafts text. Deterministic logic Scenario 2: System halts gracefully when fetches data, scores it, and dictates routing. evidence is missing, safely bypassing AI. Failure Recovery Validator catches unsupported claims and fails Scenario 3: Controlled fault injection closed to manual review. caught and rejected by Validator script. Precision / Recall / FP Held-out evaluation set maps routing Dashboard metrics panel displaying Eval Cost decisions to a confusion matrix. A (Routing) and Eval B (Safety). Defensive Only Generates response drafts. Cannot initiate Final state is a generated PDF; no charges or alter customer states. merchant API states are modified. Integration Ingests standard webhook JSON structures Triggering the workflow via POST request and parses real payloads. matching standard webhook schema. |
| --- | --- |


## 11. JUDGE ATTACK (Q&A DEFENSE)

## 1. Why does this need AI? Why not use rules alone?

Rules are perfect for gathering and evaluating data, which is why our deterministic engine handles all routing. However, compiling those rigid data points into a readable, contextual response narrative takes an analyst significant time. We use AI exclusively as a drafting assistant to translate verified JSON structures into human-readable text, saving manual compilation time.

## 2. How do you prevent hallucinations?

We do not rely on prompting for safety. We implement a Post-Generation Validator. It extracts entities (dates, IPs, amounts) from the LLM output and checks them against the deterministic database snapshot. If an unsupported claim is found, the draft is rejected.

## 3. What exactly is measured, and what is your ground truth?

We run two independent evaluations. Evaluation A measures routing precision/recall, where ground truth is whether the available telemetry is sufficient to satisfy the merchant's routing policy. Evaluation B measures safety, specifically the Validator's detection rate against injected unsupported claims. We do not measure legal truth or whether a bank would definitely accept the dispute.

## 4. Does the system actually submit a dispute?

No. In this MVP, the system assists the analyst, compiles the package, and pauses at HUMAN_APPROVAL_REQUIRED. Clicking approve simulates submission by updating our internal state, but no external bank APIs are actually called.

## 5. Are IP/device matches proof of identity?

No, and we explicitly define them as supporting consistency signals. An IP match can be weakened by shared networks or VPNs. The system assesses evidence consistency, not definitive identity proof.

## 6. What happens if the Validator crashes?

The system fails closed. If the validation layer cannot execute, the draft is discarded, and the case defaults to MANUAL_REVIEW. We always prefer a manual false negative over an unsafe automated false positive.

## 12. "DO NOT CLAIM" LIST

To maintain strict technical credibility, the team MUST NEVER claim the following in the pitch, README, demo, or Q&A:

- "Guarantees chargeback wins" or "Guarantees bank acceptance."

- "Provides definitive proof of fraud" or "Makes legal determinations."

- "100% hallucination-free." (Say instead: "Unsupported claims are caught by our validation layer.")

- "Bank-compliant formatting." (Say instead: "Structured evidence summaries.")

- "Zero false positives."

- "Fully autonomous." (The system explicitly requires human approval).

- "Actually recovered ₹X" (Must state: "Simulated the recovery workflow for ₹X").

- "IP addresses prove identity." (Must state: "IP matches serve as supporting consistency signals").

- Claiming measured performance on the holdout set before the evaluation script is actually run.

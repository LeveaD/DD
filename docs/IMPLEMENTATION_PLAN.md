# DisputeDefend AI — Implementation Plan & Testing Strategy

## Document Status
- **Role:** Lead Software Architect Implementation Plan
- **Project:** DisputeDefend AI
- **Compliance:** Aligned with `docs/PRD.md` and `docs/PROJECT_RULES.md`

---

## 1. Testing Strategy

Every component in DisputeDefend AI requires empirical test verification prior to marking any milestone complete (per `PROJECT_RULES.md` Rule 12 & 13).

### 1.1 Test Matrix & Categories

| Test Suite Category | Description | Primary Verification Target |
|---|---|---|
| **Unit Tests** | Schema validation, evidence scoring functions, timestamp ordering logic. | Ensure zero regression in deterministic calculations. |
| **State Machine Tests** | Explicit transition execution; assertion of invalid transition errors. | Ensure LLM or invalid API calls cannot force state changes. |
| **Validator Hardening Tests** | Regex extraction of IPv4/IPv6, ISO dates, formats, amounts (in major currency units), and semantic fact boundaries. | Verify detection of hallucinated entities and unsupported intent claims. |
| **Fail-Closed Integration Tests**| Simulated validator crashes, DB network dropouts, missing evidence payloads. | Assert system forces state to `MANUAL_REVIEW` and retains rejected drafts in audit log. |
| **Benchmark Suite Tests** | Execution of `tests/eval_runner.py` with seed = 42 for Evaluation A (non-circular oracle) & Evaluation B. | Ensure reproducible execution and exact metric computation. |
| **UI Integration Tests** | Queue navigation, Evidence Inspector rendering, analyst approval workflow (`READY_FOR_SUBMISSION` -> `SUBMITTED`). | Ensure clean visual display of queue states and draft watermark. |

---

## 2. Implementation Milestones in Exact Dependency Order

```
[Milestone 1: Schemas & Domain Models]
                 │
                 ▼
[Milestone 2: Seed 42 Synthetic DB & Non-Circular Oracle Generator]
                 │
                 ▼
[Milestone 3: Deterministic Engine & State Machine]
                 │
                 ▼
[Milestone 4: LLM Drafting & Post-Gen Hard Validator]
                 │
                 ▼
[Milestone 5: Application-Level Append-Only Audit Logger & PDF Compiler]
                 │
                 ▼
[Milestone 6: Evaluation Runner (Eval A & B)]
                 │
                 ▼
[Milestone 7: Dashboard UI & Evidence Inspector]
                 │
                 ▼
[Milestone 8: End-to-End Demo Script & Consistency Verification]
```

### Milestone Breakdown

#### Milestone 1: Core Schemas & Type Definitions
- Create shared type definitions and JSON schemas for Webhook Payload, User, Transaction (amount in major currency units), Telemetry Logs, Dispute Case, and Audit Log.
- *Verification:* Execute unit test suite verifying schema validator rejects malformed webhooks.

#### Milestone 2: Synthetic Data & Non-Circular Oracle Generator (`seed = 42`)
- Build reproducible synthetic database populator generating 150 dispute cases and associated merchant telemetry logs (users, transactions, login IPs, TOS acceptances, consumption logs).
- Assign ground-truth labels (`DEFENDABLE` / `NOT_DEFENDABLE`) independently using a synthetic scenario oracle *before* invoking production routing logic.
- Split 150 cases into 70% Dev (105 cases) and 30% Held-Out (45 cases).
- *Verification:* Execute seed validation test proving deterministic output and non-circular ground truth generation across runs.

#### Milestone 3: Deterministic Verification & Defensive Routing Engine
- Implement state machine enforcing application-controlled state transitions (`RECEIVED` -> `EVIDENCE_FETCHING` -> `EVIDENCE_VERIFIED` -> `SUFFICIENCY_ASSESSED` -> `RESPONSE_DRAFTED` -> `RESPONSE_VALIDATED` -> `HUMAN_APPROVAL_REQUIRED` -> `READY_FOR_SUBMISSION` -> `SUBMITTED`).
- Build evidence verification logic producing `VERIFIED_EVIDENCE_SNAPSHOT`.
- Implement routing rules: Strong Telemetry -> `RESPONSE_DRAFTED`, Partial/Contradictory/Missing -> `MANUAL_REVIEW`.
- *Verification:* Execute state transition unit tests asserting invalid state jumps fail closed.

#### Milestone 4: Bounded LLM Narrative Generator & Hard Validator
- Integrate Gemini API call using strict system prompt containing ONLY `VERIFIED_EVIDENCE_SNAPSHOT`.
- Enforce strict system prompt boundaries prohibiting claims of customer intent, legal conclusions, or fraud certainty.
- Build deterministic Post-Generation Hard Validator extracting dates, IPs, amounts (in major currency units), user IDs, and checking semantic fact boundaries against snapshot.
- Implement Fail-Closed fallback: If validator fails or crashes -> transition to `RESPONSE_VALIDATION_FAILED` -> `MANUAL_REVIEW`. *The invalid output is excluded from the final evidence package and cannot progress through the workflow; the rejected output is retained in the application-level append-only audit log for traceability.*
- *Verification:* Run validator unit tests against clean drafts (must pass) and injected hallucinations (must reject).

#### Milestone 5: Application-Level Append-Only Audit Logger & PDF Evidence Compiler
- Implement application-level append-only audit logger. Historical audit entries have no update or delete operations. Retain rejected drafts for auditability.
- Build PDF generation script producing structured evidence package upon analyst approval (`READY_FOR_SUBMISSION`).
- *Verification:* Verify audit log append operations reject UPDATE/DELETE methods. Verify PDF generation output.

#### Milestone 6: Evaluation Harness (Evaluation A & B)
- Build `eval_runner.py` executing Evaluation A on 45 held-out synthetic cases comparing independent oracle ground truth against system predictions, calculating Precision, Recall, F1, FPR, FNR.
- Build Evaluation B harness running 100 clean + 100 fault-injected drafts, calculating Unsupported-Claim Detection Rate and False Acceptance Rate.
- *Verification:* Run evaluation benchmark script and verify output formatting.

#### Milestone 7: Frontend UI Dashboard & Evidence Inspector
- Build single-page web UI:
  - Command Center with Queue Counters & Metrics Panel.
  - Queue Navigation Views (`HUMAN_APPROVAL_REQUIRED`, `MANUAL_REVIEW`, `READY_FOR_SUBMISSION`, `SUBMITTED`).
  - Evidence Inspector View displaying signals checklist, AI draft viewer (watermarked), validation status, and Approve (`READY_FOR_SUBMISSION`) / Submit (`SUBMITTED`) / Reject (`MANUAL_REVIEW`) buttons.
- *Verification:* Manual visual inspection and workflow testing in browser.

#### Milestone 8: End-to-End Demo Flow & Audit Consistency Check
- Validate 3 required demo scenarios:
  1. *Scenario 1 (Strong Evidence):* Webhook -> AI draft -> Validator Pass -> Analyst Approve -> `READY_FOR_SUBMISSION` -> Analyst Submit -> `SUBMITTED`.
  2. *Scenario 2 (Missing Evidence):* Webhook -> Sufficiency Fail -> Bypasses LLM -> `MANUAL_REVIEW`.
  3. *Scenario 3 (Validator Fault Injection):* Webhook -> Corrupted Draft Injection -> Validator Catch -> `RESPONSE_VALIDATION_FAILED` -> `MANUAL_REVIEW`.
- *Verification:* Run full system end-to-end integration test suite.

---

## 3. Requirements Traceability Matrix

| Requirement | PRD Reference | PROJECT_RULES Reference | Architecture Component | Milestone |
|---|---|---|---|---|
| Evidence-First Defensive Routing | PRD §1, §3 | Rule 6 | Defensive Routing Engine | Milestone 3 |
| State Machine Control | PRD §4 | Rule 6, Rule 8 | State Machine Engine | Milestone 3 |
| Bounded LLM Text Generation | PRD §1, §4 | Rule 7, Rule 8 | Gemini Narrative Generator | Milestone 4 |
| Post-Generation Hard Validator | PRD §5 | Rule 6, Rule 9 | Entity & Fact Hard Validator | Milestone 4 |
| Fail-Closed Behavior | PRD §5 | Rule 9 | Routing Engine & State Machine | Milestone 3, 4 |
| Application-Level Append-Only Audit Log | PRD §7 | Rule 6 | Audit Logger | Milestone 5 |
| Non-Circular Evaluation A (150 cases, seed 42) | PRD §6 | Rule 11 | Evaluation Runner | Milestone 2, 6 |
| Evaluation B (200 safety samples)| PRD §6 | Rule 11 | Evaluation Runner | Milestone 6 |
| Boundary Separation (Real/Syn/Sim) | PRD §2 | Rule 10 | Core System Architecture | Milestone 1-8 |
| Human Approval & Controlled Submission | PRD §1, §4, §11| Rule 8 | Dashboard UI & Action API | Milestone 7 |

---

## 4. Consistency Check Against PRD.md and PROJECT_RULES.md

A rigorous cross-verification was conducted between `PRD.md`, `PROJECT_RULES.md`, and the architectural blueprint:

1. **LLM Scope & Authority:** `PROJECT_RULES.md` (Rules 7 & 8) mandates that LLM MUST NEVER determine routing, change state, create evidence, or submit disputes. The blueprint enforces this by maintaining state machine execution entirely in deterministic code and using the LLM solely for drafting text from `VERIFIED_EVIDENCE_SNAPSHOT`.
2. **Infrastructure Constraints:** `PROJECT_RULES.md` (Rule 5) prohibits microservices, Kafka, Redis, Celery, RAG, and vector databases. The architecture is strictly specified as a lightweight single-service application with standard HTTP/JSON APIs and local/embedded append-only storage.
3. **Failure Policy:** Both `PRD.md` §5 and `PROJECT_RULES.md` Rule 9 require Fail-Closed handling (`MANUAL_REVIEW`). The blueprint enforces that missing telemetry, contradictory timestamps, validator rejections, or runtime crashes all route directly to `MANUAL_REVIEW`.
4. **Boundary Clarity:** Both documents require clear delineation between REAL, SYNTHETIC, and SIMULATED boundaries. The blueprint preserves real webhook handling, real Gemini drafting, real validation, synthetic database/evaluation data, and simulated submission.

**Contradictions Discovered:** ZERO contradictions found. All specifications are completely aligned.

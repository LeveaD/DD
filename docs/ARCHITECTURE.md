# DisputeDefend AI — Architecture Specification & Implementation Blueprint

## Document Status
- **Role:** Lead Software Architect Specification
- **Project:** DisputeDefend AI (Razorpay AI Buildathon 2026 — Track 02: AI Risk Manager)
- **Paradigm:** Evidence-First Defensive Routing
- **Compliance:** Aligned strictly with `docs/PRD.md` and `docs/PROJECT_RULES.md`

---

## 1. Product Workflow in Plain English

DisputeDefend AI operates as a defensive, human-in-the-loop assistant for digital merchants handling payment dispute chargebacks (e.g., friendly fraud).

1. **Ingestion:** A chargeback notification is received via an incoming JSON webhook payload containing dispute and transaction IDs. The state transitions to `RECEIVED`.
2. **Evidence Fetching:** The system deterministically queries the merchant database for user telemetry associated with the transaction (account details, login IP history, Terms of Service [TOS] acceptance logs, and post-purchase resource consumption/download logs). State transitions to `EVIDENCE_FETCHING`.
3. **Verification:** The deterministic engine inspects evidence timestamps, IP consistency, identity matches, and logical event sequences, storing the snapshot as `VERIFIED_EVIDENCE_SNAPSHOT`. State transitions to `EVIDENCE_VERIFIED`.
4. **Sufficiency Assessment:** The routing engine evaluates the verified telemetry against explicit evidence sufficiency rules. State transitions to `SUFFICIENCY_ASSESSED`.
   - **Branch A (Strong / Defendable Evidence):** If identity match, IP consistency, TOS acceptance, and post-purchase usage are all present and logically consistent, the system passes the `VERIFIED_EVIDENCE_SNAPSHOT` to the LLM. The LLM generates a factual response narrative. State transitions to `RESPONSE_DRAFTED`.
   - **Branch B (Insufficient or Contradictory Evidence):** If key telemetry is missing or timestamps contradict (e.g., usage logged before purchase), the LLM is completely bypassed. State transitions directly to `MANUAL_REVIEW`.
5. **Post-Generation Validation (for Branch A):** A deterministic hard validator inspects the generated LLM text for entity alignment and semantic fact boundaries against the `VERIFIED_EVIDENCE_SNAPSHOT`.
   - If 100% of mentioned dates, IPs, amounts, user identifiers, and factual statements correspond directly to the snapshot (with zero unsupported claims of customer intent or legal fraud certainty), state transitions to `RESPONSE_VALIDATED` → `HUMAN_APPROVAL_REQUIRED`.
   - If any unsupported claim, hallucinated entity, or legal conclusion is detected, the draft is rejected. State transitions to `RESPONSE_VALIDATION_FAILED` → `MANUAL_REVIEW`. *The invalid output is excluded from the final evidence package and cannot progress through the workflow; the rejected output is retained in the application-level append-only audit log for traceability.*
6. **Analyst Review & Submission:** An analyst inspects the case in the dashboard queue.
   - Upon clicking "Approve", state transitions from `HUMAN_APPROVAL_REQUIRED` → `READY_FOR_SUBMISSION`, triggering structured PDF evidence package compilation.
   - A separate controlled submission action transitions state from `READY_FOR_SUBMISSION` → `SUBMITTED` (simulating external submission).
   - If rejected by the analyst, state transitions to `MANUAL_REVIEW`.

---

## 2. State Machine & AI Boundaries

The application state machine is controlled entirely by deterministic code. The LLM has zero authority to transition state, modify data, approve outputs, or submit disputes.

```
                         ┌──────────────────┐
                         │    1. RECEIVED   │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │EVIDENCE_FETCHING │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │EVIDENCE_VERIFIED │
                         └────────┬─────────┘
                                  │
                         ┌────────▼─────────┐
                         │SUFFICIENCY_ASSESS│
                         └────────┬─────────┘
                                  │
            ┌─────────────────────┴─────────────────────┐
            │                                           │
  (Strong Telemetry)                         (Partial / Contradictory /
            │                                 Missing Telemetry)
   ┌────────▼─────────┐                                 │
   │ RESPONSE_DRAFTED │                                 │
   └────────┬─────────┘                                 │
            │                                           │
   ┌────────▼─────────┐ (Validation Failed /            │
   │RESPONSE_VALIDATE │  System Crash)                  │
   └───┬──────────┬───┘                                 │
       │          └─────────────────────────┐           │
(Pass) │                                    │           │
   ┌───▼──────────────┐            ┌────────▼───────────▼┐
   │HUMAN_APPROVAL_REQ│            │    MANUAL_REVIEW    │
   └───┬──────────────┘            └─────────────────────┘
       │ (Analyst Action: Approve)
   ┌───▼──────────────┐
   │READY_FOR_SUBMISS │
   └───┬──────────────┘
       │ (Analyst Action: Submit)
   ┌───▼──────────────┐
   │   10. SUBMITTED  │
   └──────────────────┘
```

### Complete State Catalog

| State Index | State Name | Trigger / Condition | Next Allowed States |
|---|---|---|---|
| 1 | `RECEIVED` | Chargeback webhook ingested and schema validated. | `EVIDENCE_FETCHING`, `MANUAL_REVIEW` |
| 2 | `EVIDENCE_FETCHING` | Fetching telemetry from database. | `EVIDENCE_VERIFIED`, `MANUAL_REVIEW` |
| 3 | `EVIDENCE_VERIFIED` | Telemetry parsed & verified into `VERIFIED_EVIDENCE_SNAPSHOT`. | `SUFFICIENCY_ASSESSED`, `MANUAL_REVIEW` |
| 4 | `SUFFICIENCY_ASSESSED` | Routing rules evaluated against sufficiency matrix. | `RESPONSE_DRAFTED`, `MANUAL_REVIEW` |
| 5 | `RESPONSE_DRAFTED` | LLM narrative generated from `VERIFIED_EVIDENCE_SNAPSHOT`. | `RESPONSE_VALIDATED`, `RESPONSE_VALIDATION_FAILED`, `MANUAL_REVIEW` |
| 6 | `RESPONSE_VALIDATED` | Validator confirmed 100% entity & fact alignment with snapshot. | `HUMAN_APPROVAL_REQUIRED`, `MANUAL_REVIEW` |
| 7 | `HUMAN_APPROVAL_REQUIRED` | Case pending in human analyst review queue. | `READY_FOR_SUBMISSION`, `MANUAL_REVIEW` |
| 8 | `READY_FOR_SUBMISSION` | Analyst approved case. PDF package compiled. | `SUBMITTED`, `MANUAL_REVIEW` |
| 9 | `SUBMITTED` | Controlled final simulated submission logged. | Terminal State |
| 10 | `MANUAL_REVIEW` | Routed to manual queue (insufficient/contradictory telemetry, validator failure, analyst rejection). | Terminal State (for automated pipeline) |
| 11 | `RESPONSE_VALIDATION_FAILED` | Intermediate state logging rejection prior to manual review fallback. | `MANUAL_REVIEW` |

---

## 3. System Components and Responsibilities

Per `PROJECT_RULES.md`, the architecture is a clean, single-service application avoiding microservices, Kafka, Redis, Celery, RAG, or vector databases.

1. **Webhook Receiver (Real):** Ingests incoming HTTP POST payloads matching payment dispute schemas. Performs strict JSON schema validation.
2. **Evidence Verification Engine (Real / Deterministic):** Queries the merchant database for user account data, IP logs, TOS records, and consumption logs. Computes boolean signal flags and compiles `VERIFIED_EVIDENCE_SNAPSHOT`.
3. **Defensive Routing Engine (Real / Deterministic):** Evaluates computed signal flags against the evidence sufficiency matrix. Routes cases either to AI drafting or directly to `MANUAL_REVIEW`.
4. **LLM Narrative Generator (Real / Bounded):** Invokes the Gemini API using a strict, system-prompt-bounded template containing ONLY `VERIFIED_EVIDENCE_SNAPSHOT`.
5. **Post-Generation Hard Validator (Real / Deterministic):** Uses regex and entity parsing to extract dates, IPs, amounts (in major currency units), user IDs, names, and factual claims from the LLM narrative, cross-checking every claim against `VERIFIED_EVIDENCE_SNAPSHOT`.
6. **Audit Logger (Real / Append-Only):** Application-level append-only audit log writing event records to disk/database tracking all state transitions, snapshots, prompts, outputs, validator outcomes, and analyst actions.
7. **PDF Compilation Engine (Real / Deterministic):** Renders structured HTML/PDF evidence packages for cases in `READY_FOR_SUBMISSION`.
8. **Evaluation Runner (Real):** Script executing Benchmark A (150 synthetic cases, seed 42, using an independent scenario oracle for ground truth) and Benchmark B (200 safety cases with fault injection).
9. **Dashboard UI (Real / Single-Page Application):** Displays queue states, Evidence Inspector, AI draft viewer, audit timeline, and evaluation metrics.

---

## 4. API Contracts

### 4.1 Ingest Chargeback Webhook
- **Endpoint:** `POST /api/webhooks/chargeback`
- **Request Body:**
```json
{
  "event": "dispute.created",
  "dispute_id": "disp_987654321",
  "transaction_id": "txn_123456789",
  "amount": 4999,
  "currency": "INR",
  "reason_code": "fraudulent",
  "chargeback_date": "2026-09-04T12:00:00Z"
}
```
- **Response (202 Accepted):**
```json
{
  "status": "success",
  "dispute_id": "disp_987654321",
  "current_state": "RECEIVED"
}
```

### 4.2 List Dispute Queue
- **Endpoint:** `GET /api/disputes?state=HUMAN_APPROVAL_REQUIRED`
- **Response (200 OK):**
```json
{
  "disputes": [
    {
      "dispute_id": "disp_987654321",
      "transaction_id": "txn_123456789",
      "amount": 4999,
      "currency": "INR",
      "current_state": "HUMAN_APPROVAL_REQUIRED",
      "sufficiency_classification": "DEFENDABLE",
      "created_at": "2026-09-04T12:00:00Z"
    }
  ]
}
```

### 4.3 Get Dispute Detail & Evidence Inspector Payload
- **Endpoint:** `GET /api/disputes/{id}`
- **Response (200 OK):**
```json
{
  "dispute_id": "disp_987654321",
  "transaction_id": "txn_123456789",
  "current_state": "HUMAN_APPROVAL_REQUIRED",
  "evidence_signals": {
    "identity_match": true,
    "ip_consistency": true,
    "post_purchase_consumption": true,
    "tos_accepted": true,
    "temporal_sequence_valid": true
  },
  "verified_evidence_snapshot": {
    "user": { "id": "usr_555", "email": "user@example.com", "name": "Jane Doe" },
    "transaction": { "amount": 4999, "currency": "INR", "ip": "192.168.1.50", "timestamp": "2026-09-01T10:00:00Z" },
    "ip_logs": [{ "ip": "192.168.1.50", "timestamp": "2026-09-01T10:05:00Z" }],
    "tos_log": { "accepted_at": "2026-09-01T09:58:00Z", "version": "v2.1" },
    "consumption_log": { "consumed_at": "2026-09-01T10:15:00Z", "resource": "digital_course_pdf" }
  },
  "llm_draft": "On September 1, 2026 at 10:00:00 UTC, user Jane Doe (usr_555) completed transaction txn_123456789 for INR 4999. Prior to purchase, TOS v2.1 was accepted at 09:58:00 UTC. Following payment, digital resource digital_course_pdf was accessed at 10:15:00 UTC from matching IP 192.168.1.50.",
  "validation_result": {
    "passed": true,
    "unsupported_claims": []
  },
  "audit_trail": [...]
}
```

### 4.4 Analyst Approval API
- **Endpoint:** `POST /api/disputes/{id}/approve`
- **Request Body:**
```json
{
  "analyst_id": "analyst_01"
}
```
- **Response (200 OK):** (Transitions state `HUMAN_APPROVAL_REQUIRED` → `READY_FOR_SUBMISSION`)
```json
{
  "dispute_id": "disp_987654321",
  "new_state": "READY_FOR_SUBMISSION",
  "pdf_url": "/api/disputes/disp_987654321/pdf"
}
```

### 4.5 Controlled Dispute Submission API
- **Endpoint:** `POST /api/disputes/{id}/submit`
- **Request Body:**
```json
{
  "analyst_id": "analyst_01"
}
```
- **Response (200 OK):** (Transitions state `READY_FOR_SUBMISSION` → `SUBMITTED`)
```json
{
  "dispute_id": "disp_987654321",
  "new_state": "SUBMITTED",
  "submission_timestamp": "2026-09-04T12:05:00Z"
}
```

### 4.6 Analyst Rejection API
- **Endpoint:** `POST /api/disputes/{id}/reject`
- **Request Body:**
```json
{
  "analyst_id": "analyst_01",
  "rejection_reason": "Analyst determined telemetry insufficient"
}
```
- **Response (200 OK):** (Transitions state to `MANUAL_REVIEW`)
```json
{
  "dispute_id": "disp_987654321",
  "new_state": "MANUAL_REVIEW"
}
```

---

## 5. Deterministic Evidence Rules & Routing Policy

Evidence points are evaluated strictly as supporting consistency signals, never as absolute proof of fraud or legal liability.

### Evidence Signal Definitions
1. **Identity Match (`identity_match`):** `dispute.user_id == merchant_db.transaction.user_id`.
2. **IP Consistency (`ip_consistency`):** `transaction.ip` matches `login.ip` or `consumption.ip`. (Treated as supporting consistency signal; NAT/VPN limitations explicitly noted).
3. **Post-Purchase Consumption (`post_purchase_consumption`):** Valid log entry exists showing resource download or activity.
4. **TOS Acceptance (`tos_accepted`):** TOS accepted record exists with `accepted_at <= transaction.timestamp`.
5. **Temporal Logic Valid (`temporal_sequence_valid`):** `tos.accepted_at <= transaction.timestamp <= consumption.consumed_at`.

### Routing Matrix

| Identity Match | IP Consistency | Post-Purchase Usage | Temporal Logic | Routing Destination | Justification |
|---|---|---|---|---|---|
| TRUE | TRUE | TRUE | TRUE | `RESPONSE_DRAFTED` | Strong Telemetry (Sufficient) |
| TRUE | FALSE | TRUE | TRUE | `MANUAL_REVIEW` | Partial / Mismatched IP Telemetry |
| TRUE | TRUE | FALSE | TRUE | `MANUAL_REVIEW` | Missing Usage Telemetry |
| TRUE | TRUE | TRUE | FALSE | `MANUAL_REVIEW` | Contradictory Timestamps |
| FALSE | Any | Any | Any | `MANUAL_REVIEW` | Insufficient / Unmatched User |

---

## 6. LLM Input/Output Contract & Bounded Prompting

### System Prompt Definition
```text
You are a factual dispute response drafting assistant for digital merchants.
Your ONLY task is to write a clear, objective summary of verified merchant telemetry based EXCLUSIVELY on the provided JSON snapshot.

STRICT CONSTRAINTS:
1. Do NOT state or imply legal conclusions, customer intent, or guaranteed fraud proof (e.g. NEVER write "The customer intentionally committed fraud").
2. Do NOT use facts, dates, IPs, amounts, email addresses, or names not in the input JSON.
3. Do NOT invent customer intentions or write aggressive tone.
4. Output plain text paragraphs only. No JSON, no markdown headers.
```

### LLM Input Payload Example
```json
{
  "case_id": "disp_987654321",
  "customer_name": "Jane Doe",
  "customer_email": "user@example.com",
  "user_id": "usr_555",
  "transaction_id": "txn_123456789",
  "transaction_amount": "INR 4999",
  "transaction_timestamp": "2026-09-01T10:00:00Z",
  "transaction_ip": "192.168.1.50",
  "tos_version": "v2.1",
  "tos_acceptance_timestamp": "2026-09-01T09:58:00Z",
  "consumption_resource": "digital_course_pdf",
  "consumption_timestamp": "2026-09-01T10:15:00Z",
  "consumption_ip": "192.168.1.50"
}
```

---

## 7. Post-Generation Validation Contract

The Post-Generation Hard Validator runs deterministically after the LLM returns text.

### Validation Algorithm
1. **Entity Extraction (Regex & String Tokenizer):**
   - Dates & Timestamps: Matches ISO dates (`YYYY-MM-DD`), UTC timestamps, format variants (`September 1, 2026`).
   - IP Addresses: IPv4 regex (`\b(?:\d{1,3}\.){3}\d{1,3}\b`) and IPv6 regex.
   - Financial Amounts: Currency symbols + numeric patterns in major units (`INR 4999`, `4999`).
   - Identifiers: User IDs (`usr_*`), Transaction IDs (`txn_*`), Dispute IDs (`disp_*`), Email addresses.
2. **Snapshot & Semantic Boundary Lookup:**
   - Every extracted entity is looked up in `VERIFIED_EVIDENCE_SNAPSHOT`.
   - Text is checked for prohibited inference keywords (e.g. "intent", "guilty", "fraudulent customer", "legal liability").
3. **Decision Rule:**
   - If ALL extracted entities match snapshot values and zero prohibited inferences are present -> **PASS** (`RESPONSE_VALIDATED`).
   - If ANY extracted entity is not in snapshot or an unsupported inference is detected -> **FAIL** (`RESPONSE_VALIDATION_FAILED` → `MANUAL_REVIEW`).
   - *The invalid output is excluded from the final evidence package and cannot progress through the workflow; the rejected output is retained in the application-level append-only audit log for traceability.*

---

## 8. Failure States and Fail-Closed Behavior

- **Failure A — Missing Evidence:** Telemetry fetch yields null records -> Bypasses LLM, routes to `MANUAL_REVIEW`.
- **Failure B — Contradictory Evidence:** Timestamp or signal check fails -> Bypasses LLM, routes to `MANUAL_REVIEW`.
- **Failure C — Unsupported AI Claim:** Validator detects hallucinated date/IP/amount or illegal intent claim -> Rejects output, routes to `RESPONSE_VALIDATION_FAILED` → `MANUAL_REVIEW`. The rejected draft is excluded from the submission package and retained in the application-level append-only audit log for auditability.
- **Failure D — System or Validator Crash:** Uncaught exception in validator, database, or network -> Fails closed immediately to `MANUAL_REVIEW`, logs error to application-level append-only audit log.

---

## 9. Integration Boundaries (Real vs. Synthetic vs. Simulated)

- **REAL:**
  - Webhook HTTP endpoint parser.
  - Deterministic evidence verification & routing engine.
  - Gemini API integration for text drafting.
  - Deterministic Post-Generation Validator.
  - PDF Compilation Engine.
- **SYNTHETIC:**
  - Merchant transaction & user telemetry database.
  - 150-case evaluation dataset (generated via seed = 42 with independent scenario oracle ground-truth labels).
- **SIMULATED:**
  - Final card network submission API (logs `SUBMITTED` state internally and creates output PDF; no live bank API invoked).

---

## 10. UI Screens and Responsibilities

1. **Command Center Dashboard:**
   - Queue Counters: Human Review Required, Manual Compilation Queue, Ready for Submission.
   - Metrics Panel: Displaying Evaluation A (Recall, Precision, F1) and Evaluation B (Validator Detection Rate).
2. **Queue Navigation View:**
   - Tabbed view filtering cases by state (`HUMAN_APPROVAL_REQUIRED`, `MANUAL_REVIEW`, `READY_FOR_SUBMISSION`, `SUBMITTED`).
3. **Evidence Inspector View:**
   - Case Header & Dispute Reason.
   - Evidence Sufficiency Assessment Banner.
   - Supporting Signals Checklist (IP consistency, TOS timestamp, post-purchase consumption).
   - AI Response Draft Viewer (watermarked: "AI-Generated Draft — Requires Human Approval").
   - Post-Generation Validation Badge (Pass/Fail status + extracted entity log).
   - Interactive Actions:
     - "Approve Package" (transitions to `READY_FOR_SUBMISSION`, compiles PDF).
     - "Submit Dispute" (transitions `READY_FOR_SUBMISSION` $\rightarrow$ `SUBMITTED`).
     - "Reject to Manual Review" (transitions to `MANUAL_REVIEW`).
   - Audit Log Timeline (Application-level append-only audit log).

---

## 11. MVP Scope vs. Non-MVP Features

### In Scope (MVP)
- Standard Webhook Ingestion.
- Synthetic Database Telemetry Lookup.
- Deterministic Evidence Verification & Defensive Routing.
- Bounded Gemini Response Narrative Drafting.
- Deterministic Entity Cross-Validator.
- Application-level Append-Only Audit Logging.
- Dashboard UI with Evidence Inspector & Queue Management.
- Evaluation Harness for Benchmark A (150 cases, seed 42, independent ground truth) & Benchmark B (200 safety cases).
- PDF Evidence Package Generation.

### Out of Scope (Forbidden Non-MVP Features per `PROJECT_RULES.md`)
- Microservices, Kafka, Kubernetes, Redis, Celery.
- Vector DBs, RAG, Multi-Agent frameworks.
- Real Bank/Gateway Submission APIs.
- User Authentication / Multi-tenant Auth systems.
- Automated Customer Refunds or state mutations on merchant accounts.

---

## 12. Unresolved Decisions & Ambiguities

1. **Razorpay Webhook Event Format:** The PRD specifies standard JSON webhooks. To adhere strictly to `PROJECT_RULES.md` ("Never invent Razorpay APIs"), the system accepts standard dispute JSON payloads while treating external gateway API calls as strictly simulated.
2. **LLM Execution Timeout:** If the Gemini API times out or returns a HTTP 5xx error, the system will execute Fail-Closed behavior (Failure D) and route directly to `MANUAL_REVIEW`.

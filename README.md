# DisputeDefend AI — Evidence-First Defensive Routing

**Razorpay AI Buildathon 2026 — Track 02: AI Risk Manager**  
*A deterministic, evidence-grounded dispute defense operations console and response-drafting assistant for digital merchants.*

---

## 1. System Paradigm & Problem Overview

Merchants facing friendly fraud lose revenue because manually compiling fragmented telemetry evidence (login IPs, Terms of Service acceptances, resource consumption logs) into formal chargeback responses is time-consuming. However, fully unconstrained AI systems introduce severe operational risk by hallucinating non-existent facts or declaring legal conclusions.

**DisputeDefend AI** enforces an **Evidence-First Defensive Routing** paradigm:
1. **Deterministic Verification**: Queries merchant telemetry and mathematically checks identity alignment, IP consistency, and temporal event sequences.
2. **Deterministic Sufficiency**: If evidence is insufficient or contradictory, the system **safely abstains** and routes directly to `MANUAL_REVIEW` without ever invoking the LLM.
3. **Strictly Bounded Drafting**: When evidence is sufficient (`DEFENDABLE`), Groq (`openai/gpt-oss-20b`) drafts a factual response narrative using strictly structured JSON schema.
4. **Post-Generation Hard Validator**: Deterministically validates 100% of mentioned dates, amounts, IPs, and identifiers against the verified snapshot before human review.
5. **Human-in-the-Loop & Simulated Submission**: Human approval is mandatory. Approved cases transition to `READY_FOR_SUBMISSION` and `SUBMITTED` internally; external bank submissions are explicitly simulated.

---

## 2. Integration Boundaries (Real vs. Synthetic vs. Simulated)

To ensure technical transparency, system boundaries are strictly defined:

- **REAL**:
  - Webhook ingestion & REST API adapter (`Express + TypeScript`).
  - Deterministic verification engine, state machine, and rule matrix (`ADR-012`).
  - Live Groq API invocation (`groq-sdk`, model: `openai/gpt-oss-20b` with strict JSON Schema).
  - Post-generation deterministic hard fact validator.
  - In-memory PDF evidence package compiler (`pdfkit`).
  - Append-only audit logging engine.
- **SYNTHETIC**:
  - Merchant database records (users, payment transactions, session IPs, TOS logs, digital downloads).
  - Evaluation benchmark dataset (150 cases generated with reproducible PRNG `seed = 42`).
  - Validator fault-injection benchmark (200 test cases).
- **SIMULATED**:
  - Bank/Payment Network Submission: Disputes transition to `SUBMITTED` in local state; no external bank or payment gateway network APIs are called.

---

## 3. Quick Start (Local Setup)

### Prerequisites
- **Node.js**: `v18.0.0+` (tested on Node `v22.17.1`)
- **npm**: `v9.0.0+`
- **Groq API Key**: A valid Groq API key is required for the live AI drafting path (`D-1001`).

### Step 1: Clone & Configure Environment
Create a `.env` file inside the `backend/` directory:
```bash
# backend/.env
GROQ_API_KEY=gsk_your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
PORT=3000
FRONTEND_ORIGIN=http://localhost:5173
```
*(Never commit `.env` or real API keys to version control. The backend automatically redacts keys from all logs and responses.)*

### Step 2: Start Backend API Server
```bash
cd backend
npm install
npm run dev
```
*The backend API will start on `http://localhost:3000`.*
- Health check: `http://localhost:3000/api/health`
- Evaluation summary: `http://localhost:3000/api/evaluation/summary`

### Step 3: Start Frontend Dashboard
In a separate terminal:
```bash
cd frontend
npm install
npm run dev
```
*The React frontend will start on `http://localhost:5173`.*

---

## 4. Canonical Hackathon Demo Scenarios

The system includes 4 pre-seeded canonical dispute scenarios accessible via the top navigation bar:

| Case ID | Scenario Name | Telemetry Characteristics | Expected Workflow Trajectory |
| :--- | :--- | :--- | :--- |
| **`D-1001`** | **Successful Defense Path** | Matching user, consistent IP, valid TOS, post-purchase consumption log | `RECEIVED` → `EVIDENCE_VERIFIED` → `DEFENDABLE` → Groq Draft → Hard Validator Pass → `HUMAN_APPROVAL_REQUIRED` → Analyst Approve → `READY_FOR_SUBMISSION` → Submit → `SUBMITTED` |
| **`D-1002`** | **Missing IP Telemetry** | Valid purchase & consumption, but checkout IP log is missing | `RECEIVED` → `EVIDENCE_VERIFIED` → Insufficient Positive Signals → `MANUAL_REVIEW` (AI drafting withheld) |
| **`D-1003`** | **Temporal Contradiction** | Resource access logged *before* the transaction timestamp | `RECEIVED` → `EVIDENCE_VERIFIED` → Critical Contradiction Detected → `MANUAL_REVIEW` (AI drafting withheld) |
| **`D-1004`** | **Identity Mismatch** | Dispute filed by claimant whose user ID does not match transaction | `RECEIVED` → `EVIDENCE_VERIFIED` → Critical Identity Contradiction → `MANUAL_REVIEW` (AI drafting withheld) |

---

## 5. Controlled Validator Failure Demo

To demonstrate post-generation hard validation without forcing a live production LLM to hallucinate, run the automated integration test:
```bash
cd backend
npm test tests/api.test.ts
```
The test harness injects an altered financial entity (`amount: 999999` instead of `3999`). The hard validator detects the entity mismatch, rejects the draft, transitions to `MANUAL_REVIEW`, retains the raw output in the append-only audit trail for investigative integrity, and excludes the invalid draft from the evidence package PDF.

---

## 6. Demo Repeatability / Reset Mechanism

To return the application to its pristine seed state during demonstrations:
```bash
# Trigger local demo reset via REST API
curl -X POST http://localhost:3000/api/reset
```
*Response: `{"success": true, "data": {"status": "reset_complete", "disputes_count": 4}}`*

All in-memory disputes will immediately revert to `RECEIVED` status and the audit logger will be reinitialized.

---

## 7. Synthetic Benchmark Results

The Evaluation screen (`/benchmark`) displays reproducible metrics measured on the synthetic test suite (`seed = 42`):

### Evaluation A: Deterministic Routing Engine (150 Synthetic Cases)
- **Precision**: 100.0% (0 False Positives — zero undefendable cases routed to drafting)
- **Recall**: 100.0% (0 False Negatives — zero defendable cases lost)
- **F1 Score**: 100.0%
- **Manual Review Rate**: **65.3%** (Defensive design: cases with partial, missing, or contradictory signals are intentionally routed to human review)
- **Data Partitions**: 105 Dev Cases / 45 Isolated Holdout Cases

### Evaluation B: Post-Generation Hard Validator (200 Controlled Samples)
- **Clean Pass Rate**: 100.0% (100/100 valid narratives accepted)
- **Fault Detection Rate**: 100.0% (100/100 mutated narratives caught and rejected across 6 fault classes: date mutations, IP fabrications, amount alterations, email hallucinations, ID hallucinations, and unsupported intent claims)
- **False Acceptance Rate**: 0.0%

*(Disclaimer: These metrics represent algorithmic benchmark performance against synthetic scenarios; they do not represent historical commercial bank win rates).*

---

## 8. Verification & Test Commands

### Backend Test Suite
```bash
cd backend
npm test            # Runs Vitest (296/296 passing)
npm run typecheck   # Typecheck with tsc (0 errors)
```

### Frontend Test Suite & Production Build
```bash
cd frontend
npm test            # Runs Vitest (4/4 passing)
npm run typecheck   # Typecheck with tsc (0 errors)
npm run build       # Production bundle build
```

---

## 9. Security & Safety Compliance

- **No Secrets in Source**: No API keys, credentials, or private tokens are stored in the codebase or fixtures.
- **Append-Only Audit**: All audit entries are recorded chronologically with zero update/delete capabilities.
- **Fail-Closed Default**: Any network failure, missing API key, or validation error automatically halts automated drafting and routes the case to `MANUAL_REVIEW`.

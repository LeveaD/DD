# DisputeDefend AI — Data Model & Entity Specifications

## Document Status
- **Role:** Lead Software Architect Data Specification
- **Project:** DisputeDefend AI
- **Compliance:** Aligned with `docs/PRD.md` and `docs/PROJECT_RULES.md`

---

## 1. Overview & Storage Strategy

Per `PROJECT_RULES.md` (Rule 5 & Rule 15), the system avoids complex distributed databases or heavy storage layers. Data is structured cleanly in JSON schema formats and managed in-memory or via standard lightweight relational/embedded storage (e.g. SQLite / structured JSON files) for audit immutability.

All financial amounts are represented consistently as **major currency units** (e.g. `amount = 4999` with `currency = "INR"` represents ₹4,999).

---

## 2. Synthetic Merchant Database Schemas

### 2.1 User Entity (`users`)
Represents customer account records in the merchant system.

| Field Name | Type | Description |
|---|---|---|
| `user_id` | String (Primary Key) | Unique identifier (e.g. `usr_101`). |
| `name` | String | Customer full name. |
| `email` | String | Customer email address. |
| `created_at` | String (ISO-8601) | Account registration timestamp. |

### 2.2 Transaction Entity (`transactions`)
Represents customer payment transactions. Amount is always represented in **major currency units**.

| Field Name | Type | Description |
|---|---|---|
| `transaction_id` | String (Primary Key) | Unique transaction ID (e.g. `txn_501`). |
| `user_id` | String (Foreign Key) | Reference to `users.user_id`. |
| `amount` | Number | Transaction amount in **major currency units** (e.g. `4999` = ₹4,999). |
| `currency` | String | 3-letter ISO currency code (e.g. `INR`). |
| `timestamp` | String (ISO-8601) | Transaction completion timestamp. |
| `ip_address` | String | IP address logged during checkout. |
| `payment_method` | String | Payment method used (e.g. `card`). |
| `card_last4` | String | Last 4 digits of payment card. |

### 2.3 IP Log Entity (`ip_logs`)
Account login and telemetry session records.

| Field Name | Type | Description |
|---|---|---|
| `log_id` | String (Primary Key) | Unique log entry ID. |
| `user_id` | String (Foreign Key) | Reference to `users.user_id`. |
| `ip_address` | String | IP address captured during session. |
| `timestamp` | String (ISO-8601) | Session timestamp. |
| `device_info` | String | User Agent / Device description. |

### 2.4 Terms of Service Log Entity (`tos_logs`)
Audit trail of merchant Terms of Service acceptance.

| Field Name | Type | Description |
|---|---|---|
| `tos_id` | String (Primary Key) | Unique acceptance log ID. |
| `user_id` | String (Foreign Key) | Reference to `users.user_id`. |
| `tos_version` | String | Accepted TOS version (e.g. `v2.1`). |
| `accepted_at` | String (ISO-8601) | Acceptance timestamp. |
| `ip_address` | String | IP address during TOS acceptance. |

### 2.5 Post-Purchase Consumption Log Entity (`consumption_logs`)
Digital product download or service usage records.

| Field Name | Type | Description |
|---|---|---|
| `consumption_id` | String (Primary Key) | Unique activity log ID. |
| `user_id` | String (Foreign Key) | Reference to `users.user_id`. |
| `transaction_id` | String (Foreign Key) | Reference to `transactions.transaction_id`. |
| `resource_id` | String | Name or ID of downloaded resource/content. |
| `consumed_at` | String (ISO-8601) | Download / access timestamp. |
| `ip_address` | String | IP address logged during consumption. |
| `bytes_downloaded` | Number | Volume of data consumed. |

---

## 3. Dispute Case Entity Schema (`dispute_cases`)

Represents active and processed chargeback cases inside DisputeDefend AI.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "DisputeCase",
  "type": "object",
  "properties": {
    "dispute_id": { "type": "string" },
    "transaction_id": { "type": "string" },
    "amount": { "type": "number", "description": "Amount in major currency units" },
    "currency": { "type": "string" },
    "reason_code": { "type": "string" },
    "chargeback_date": { "type": "string", "format": "date-time" },
    "current_state": {
      "type": "string",
      "enum": [
        "RECEIVED",
        "EVIDENCE_FETCHING",
        "EVIDENCE_VERIFIED",
        "SUFFICIENCY_ASSESSED",
        "RESPONSE_DRAFTED",
        "RESPONSE_VALIDATED",
        "HUMAN_APPROVAL_REQUIRED",
        "READY_FOR_SUBMISSION",
        "SUBMITTED",
        "MANUAL_REVIEW",
        "RESPONSE_VALIDATION_FAILED"
      ]
    },
    "evidence_signals": {
      "type": "object",
      "properties": {
        "identity_match": { "type": "boolean" },
        "ip_consistency": { "type": "boolean" },
        "post_purchase_consumption": { "type": "boolean" },
        "tos_accepted": { "type": "boolean" },
        "temporal_sequence_valid": { "type": "boolean" }
      },
      "required": [
        "identity_match",
        "ip_consistency",
        "post_purchase_consumption",
        "tos_accepted",
        "temporal_sequence_valid"
      ]
    },
    "sufficiency_classification": {
      "type": "string",
      "enum": ["DEFENDABLE", "NOT_DEFENDABLE"]
    },
    "verified_evidence_snapshot": { "type": ["object", "null"] },
    "llm_draft": { "type": ["string", "null"] },
    "validation_result": {
      "type": "object",
      "properties": {
        "passed": { "type": "boolean" },
        "unsupported_claims": {
          "type": "array",
          "items": { "type": "string" }
        }
      }
    },
    "created_at": { "type": "string", "format": "date-time" },
    "updated_at": { "type": "string", "format": "date-time" }
  },
  "required": [
    "dispute_id",
    "transaction_id",
    "amount",
    "currency",
    "current_state",
    "created_at"
  ]
}
```

---

## 4. Application-Level Append-Only Audit Log Schema (`audit_logs`)

Per `PRD.md` §7, audit logs use an application-level append-only design. No application update or delete operations are exposed for historical audit entries. Rejected LLM outputs are retained in the audit log for auditability and traceability.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AuditLogEntry",
  "type": "object",
  "properties": {
    "log_id": { "type": "string" },
    "dispute_id": { "type": "string" },
    "timestamp": { "type": "string", "format": "date-time" },
    "event_type": { "type": "string" },
    "previous_state": { "type": "string" },
    "next_state": { "type": "string" },
    "verified_evidence_snapshot": { "type": "object" },
    "llm_prompt_metadata": {
      "type": "object",
      "properties": {
        "model_version": { "type": "string" },
        "temperature": { "type": "number" }
      }
    },
    "llm_output": { "type": ["string", "null"] },
    "validation_result": {
      "type": "object",
      "properties": {
        "passed": { "type": "boolean" },
        "reason": { "type": ["string", "null"] }
      }
    },
    "human_action": {
      "type": "object",
      "properties": {
        "analyst_id": { "type": ["string", "null"] },
        "action": { "type": ["string", "null"] },
        "timestamp": { "type": ["string", "null"] }
      }
    },
    "failure_reason": { "type": ["string", "null"] }
  },
  "required": [
    "log_id",
    "dispute_id",
    "timestamp",
    "event_type",
    "previous_state",
    "next_state"
  ]
}
```

---

## 5. Evaluation Dataset Schemas

### 5.1 Benchmark A Case Entity (`eval_a_cases`)
- `case_id`: String (e.g. `eval_a_001`).
- `seed`: 42.
- `split`: String (`DEV` [70%] or `HOLDOUT` [30%]).
- `synthetic_evidence`: Object containing user, transaction, IP logs, TOS logs, and consumption logs.
- `ground_truth`: String (`DEFENDABLE` or `NOT_DEFENDABLE`). *Assigned independently by synthetic scenario generator oracle prior to running production routing logic.*

### 5.2 Benchmark B Fault Injection Case Entity (`eval_b_cases`)
- `test_id`: String (e.g. `eval_b_001`).
- `type`: String (`CLEAN` [100 samples] or `FAULT_INJECTED` [100 samples]).
- `verified_evidence_snapshot`: Object (Ground truth benchmark snapshot).
- `input_narrative`: String (LLM response containing either genuine facts or injected entity/semantic mutations like altered dates, fabricated IPs, changed amounts, or unsupported intent claims).
- `expected_validator_outcome`: Boolean (`true` for CLEAN, `false` for FAULT_INJECTED).

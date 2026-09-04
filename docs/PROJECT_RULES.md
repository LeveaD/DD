PROJECT RULES — DISPUTEDEFEND AI

1. The attached PRD is the primary product specification.

2. Never invent:
   - Razorpay APIs
   - webhook event names
   - API fields
   - bank/network requirements
   - competitor capabilities
   - compliance claims
   - performance results

3. When an external capability is uncertain:
   - verify it using official documentation if possible
   - otherwise mark it as simulated
   - never silently assume it exists.

4. Never expand the MVP without explicit instruction.

5. Never add:
   - microservices
   - Kafka
   - Kubernetes
   - Redis
   - Celery
   - vector databases
   - RAG
   - multi-agent architecture
   - unnecessary authentication
   unless explicitly required by a later instruction.

6. Deterministic code controls:
   - evidence retrieval
   - evidence verification
   - routing
   - state transitions
   - validation
   - audit logging

7. LLM is ONLY allowed to:
   - generate response narrative
   - summarize verified facts.

8. LLM MUST NEVER:
   - create evidence
   - modify source evidence
   - modify financial values
   - modify timestamps
   - determine routing
   - change state
   - approve itself
   - submit anything.

9. If validation fails:
   FAIL CLOSED → MANUAL_REVIEW.

10. The system must distinguish:
    REAL
    SYNTHETIC
    SIMULATED

11. Never report target metrics as measured results.

12. Every implementation must have tests.

13. Do not mark a task complete merely because code was written.
    Execute it and verify the behavior.

14. Before making architectural changes, explain the reason
    and check whether it conflicts with the PRD.

15. Prefer the simplest implementation that satisfies the requirement.
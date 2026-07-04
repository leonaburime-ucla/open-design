# Architect Evals — TODO

## Current State

- Canary eval complete: `arch-eval-1-billing-ledger-migration` (34 seeds, validated)
- Agent (Claude Opus subagent) scored 94% — strong performance, 4 partials on subtle T3/T4 seeds
- Seed-ledger audited by Gemini 3.1 Pro and GPT-5.5, corrections applied
- Fixture docs grounded with all necessary signals for 34 seeds

## Next: Multi-Scenario Expansion

Target: **6 scenarios × ~40 seeds each = ~240 total seeds**

| # | Scenario | Domain | Dominant Drivers | Status |
|---|----------|--------|-----------------|--------|
| 1 | Billing ledger migration | Brownfield B2B fintech | Compliance, data integrity, operability, migration safety | DONE (34 seeds) — needs ~6 more to reach 40 |
| 2 | Flash-sale ticketing | Greenfield consumer | Performance, scalability, data consistency ("no double-sell"), reliability | NOT STARTED |
| 3 | B2B partner integration hub | Brownfield enterprise | Integration complexity, modifiability, cognitive load, operability | NOT STARTED |
| 4 | Enterprise RAG assistant | Greenfield AI/ML | Tenant isolation, security, compliance, cost, AI-specific conditional skills | NOT STARTED |
| 5 | Real-time collaboration platform | Greenfield consumer | Reliability, scalability, deployment independence, performance | NOT STARTED |
| 6 | Fintech regulatory migration | Brownfield regulated | Compliance so heavy Simplicity Gate should be overridden, migration safety, security | NOT STARTED |

## Seed Design Requirements

Per scenario, seeds must cover these categories:

| Category | Description | Seeds/scenario |
|----------|-------------|---------------|
| A: Axis activation | FN (must activate) + FP (must NOT activate) | 3-4 |
| B: Score calibration | Too high + too low | 6-8 |
| C: Blocking / over/under-blocking | Reject when fatal + approve-with-conditions when borderline | 6-8 |
| D: Adaptability / selection | Same-band tiebreaker + different-band override | 2-3 |
| E: Confidence calibration | Use evidence, don't overclaim | 2-3 |
| F: Tradeoff credibility | No all-5s, genuine sacrifice | 2-3 |
| G: Migration safety | (brownfield only) Path reasoning, not target-only | 6-8 |
| H: Conditional skill / constitution | Correct skill loading, justified exceptions | 3-4 |

## Difficulty Distribution Per Scenario

| Tier | Seeds | Expected Score (strong agent) | Purpose |
|------|-------|-------------------------------|---------|
| T1 | 2-3 | 90-100% | Baseline — confirms agent isn't broken |
| T2 | 8-10 | 85-100% | Solid judgment — rule application with cross-doc synthesis |
| T3 | 15-18 | 50-75% | Genuine ambiguity — two defensible answers, weighting determines winner |
| T4 | 10-12 | 30-60% | Wicked problems — refuse-to-decide, over-blocking traps, contradictions to reframe |

## Hard Seed Types (T3/T4) — Must Include Across Suite

- Genuine ambiguity: 2 candidates both defensible, answer depends on value weighting
- Refuse-to-decide: constraints impossible / need more research / need stakeholder alignment
- Over-blocking traps: agent should approve with conditions, not reject
- Under-blocking traps: agent should catch a subtle fatal flaw that looks OK
- Constitution exceptions: Simplicity Gate should be overridden with justification
- Misleading evidence: metrics/tests prove the wrong thing
- Contradicting stakeholder mandates: escalate + reframe, don't pretend satisfiable
- Bounded pattern application: partial adoption is valid, all-or-nothing is wrong

## Process Reminders

- Mandatory: read agent's `skills.md` FIRST before designing any seeds
- Mandatory: identify agent's actual output format and decision types
- Canary first: write 1 scenario, run it, validate scoring, THEN expand
- Audit with multiple models before finalizing
- Penalize over-blocking equally with under-blocking
- Include seeds where correct answer is "approve with conditions"
- Never include seeds where correct answer is obvious from prompt wording

## What NOT To Do

- Don't test system design ability (agent evaluates patterns, doesn't design systems)
- Don't make seeds easy by explicitly stating rules in the task prompt
- Don't repeat the same judgment behavior across multiple seeds
- Don't use the 40-65% target as universal — use tiered targets
- Don't commit run directories (scratch, belongs in ADS-project-knowledge)

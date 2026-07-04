# Controls — Architect Eval Suite

Suite kind: `benchmark`

Positive controls (fatal invariants):

- `SEED-ARCH-01` — compliance_auditability must activate given explicit SOC 2
  and traceability requirements
- `SEED-ARCH-04` — microservices must be blocked for a 5-FTE team with no
  microservices experience and no Kubernetes

Negative controls:

- `SEED-ARCH-02` — do not activate tenant_isolation for a single-operator
  platform serving enterprise customers (multi-customer ≠ multi-tenant
  architecture)

Why these packs exist:

- Fatal invariant controls verify the agent catches mandatory axis
  activations and enforces blocking rules — the two most critical judgment
  behaviors.
- The negative control measures false-positive behavior: over-activating
  optional axes based on surface-level signals rather than actual
  architectural triggers.

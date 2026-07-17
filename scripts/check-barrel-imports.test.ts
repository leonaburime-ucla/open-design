import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPABILITY_BARREL_DOMAINS,
  type CapabilityBarrelDomain,
  collectBarrelImportViolationsFromSource,
  validateDomainConfig,
} from "./check-barrel-imports.ts";

// A fixture domain mirroring the real http/ shape, so rule tests stay stable independent of
// future registry edits (a separate test asserts the real registry is valid).
const domain: CapabilityBarrelDomain = {
  name: "http",
  root: "apps/daemon/src/http",
  subdirs: ["core", "request", "response", "origin", "compat", "adapter"],
  foundation: "core",
  allowedEdges: [
    ["adapter", "request"],
    ["adapter", "response"],
    ["adapter", "origin"],
  ],
};

const inAdapter = "apps/daemon/src/http/adapter/adapter.ts";
const inRequest = "apps/daemon/src/http/request/parse.ts";
const inResponse = "apps/daemon/src/http/response/response.ts";
const external = "apps/daemon/src/server.ts";

function violate(fromPath: string, source: string): ReturnType<typeof collectBarrelImportViolationsFromSource> {
  return collectBarrelImportViolationsFromSource(fromPath, source, domain);
}

// ── Rule 1: external code must use the domain barrel ──────────────────────────

test("Rule 1: external code importing a subdir directly is a violation", () => {
  const v = violate(external, "import { sendApiError } from './http/compat/api-errors.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must import `http` via its barrel/);
});

test("Rule 1: external code importing the domain barrel is allowed", () => {
  assert.deepEqual(violate(external, "import { sendCompatApiError } from './http/index.js';"), []);
});

// ── Foundation + same-subdir + allowed edges: no violation ───────────────────

test("a sibling importing core directly (any path) is allowed — foundation kernel", () => {
  assert.deepEqual(violate(inRequest, "import type { RouteInputContext } from '../core/types.js';"), []);
  assert.deepEqual(violate(inRequest, "import type { RouteInputContext } from '../core/index.js';"), []);
});

test("same-subdir imports are allowed", () => {
  assert.deepEqual(violate(inAdapter, "import { defineJsonRoute } from './adapter.js';"), []);
});

test("an allowed edge through the sibling barrel is permitted", () => {
  assert.deepEqual(violate(inAdapter, "import { rawInput } from '../request/index.js';"), []);
  assert.deepEqual(violate(inAdapter, "import { sendJson } from '../response/index.js';"), []);
  assert.deepEqual(violate(inAdapter, "import { guardSameOrigin } from '../origin/index.js';"), []);
});

// ── Rule 4: cross-subdir dependency rules ────────────────────────────────────

test("Rule 4: an allowed edge reaching a private sibling file is a violation", () => {
  const v = violate(inAdapter, "import { rawInput } from '../request/parse.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /through its barrel .* not a private file/);
});

test("Rule 4: a non-declared sibling edge is a violation", () => {
  const v = violate(inRequest, "import { sendJson } from '../response/index.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /may not import sibling `response\/`/);
});

test("Rule 4: compat/ has no declared edges — reaching any sibling is a violation", () => {
  const v = violate("apps/daemon/src/http/compat/api-errors.ts", "import { sendJson } from '../response/index.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /may not import sibling `response\/`/);
});

// ── Rule 5: no subdir → domain root barrel ───────────────────────────────────

test("Rule 5: a subdir importing the domain root barrel is a violation", () => {
  const v = violate(inAdapter, "import { ok } from '../index.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must not import the domain root barrel/);
});

// ── Rule 6: domain-root files may reach a subdir only through its barrel ─────

const domainRootBarrel = "apps/daemon/src/http/index.ts";

test("Rule 6: the root index importing subdir barrels stays allowed", () => {
  assert.deepEqual(
    violate(
      domainRootBarrel,
      "export { ok, err } from './core/index.js';\nexport { rawInput } from './request/index.js';",
    ),
    [],
  );
});

test("Rule 6: the root index importing a subdir private file is a violation", () => {
  const v = violate(domainRootBarrel, "export { rawInput } from './request/parse.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must import `request\/` through its barrel/);
});

// ── Rule 7: the domain root barrel must use named re-exports, not export * ───

test("Rule 7: `export *` in the domain root barrel is a violation", () => {
  const v = violate(domainRootBarrel, "export * from './adapter/index.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /must re-export named symbols, not `export \*/);
});

test("Rule 7: named re-exports in the domain root barrel are allowed", () => {
  assert.deepEqual(violate(domainRootBarrel, "export { mountJsonRoute } from './adapter/index.js';"), []);
});

test("Rule 7: `export *` inside a subdir barrel (own private file) stays allowed", () => {
  const subdirBarrel = "apps/daemon/src/http/adapter/index.ts";
  assert.deepEqual(violate(subdirBarrel, "export * from './adapter.js';"), []);
});

// ── AST completeness: every import form is scanned ───────────────────────────

test("dynamic import() of a private sibling file is flagged (allowed-edge, wrong path)", () => {
  const v = violate(inAdapter, "export async function f() { return import('../request/parse.js'); }");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /through its barrel .* not a private file/);
});

test("dynamic import() of a non-declared sibling is flagged", () => {
  const v = violate(inRequest, "export async function f() { return import('../response/index.js'); }");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /may not import sibling `response\/`/);
});

test("import-equals require() of a non-declared sibling is flagged", () => {
  const v = violate(inRequest, "import req = require('../response/index.js');\nexport const _r = req;");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /may not import sibling `response\/`/);
});

test("export ... from a private sibling file is flagged", () => {
  const v = violate(inAdapter, "export { sendJson } from '../response/response.js';");
  assert.equal(v.length, 1);
  assert.match(v[0]!.reason, /through its barrel .* not a private file/);
});

test("dynamic import() of a bare builtin is not flagged", () => {
  assert.deepEqual(violate(inResponse, "export async function f() { return import('node:fs/promises'); }"), []);
});

// ── Config validation: acyclic allowedEdges ──────────────────────────────────

test("every registered capability-barrel domain has a valid, acyclic config", () => {
  for (const registered of CAPABILITY_BARREL_DOMAINS) {
    assert.deepEqual(validateDomainConfig(registered), [], `domain ${registered.name} should validate cleanly`);
  }
});

test("config validation rejects a two-way (cyclic) edge set", () => {
  const errors = validateDomainConfig({
    ...domain,
    allowedEdges: [["adapter", "request"], ["request", "adapter"]],
  });
  assert.ok(errors.some((e) => /cycle/.test(e)), errors.join("; "));
});

test("config validation rejects a self-loop edge", () => {
  const errors = validateDomainConfig({ ...domain, allowedEdges: [["adapter", "adapter"]] });
  assert.ok(errors.some((e) => /cycle/.test(e)), errors.join("; "));
});

test("config validation rejects an edge referencing an unknown subdir", () => {
  const errors = validateDomainConfig({ ...domain, allowedEdges: [["adapter", "ghost"]] });
  assert.ok(errors.some((e) => /not a declared subdir/.test(e)), errors.join("; "));
});

test("config validation rejects the foundation appearing in an edge", () => {
  const errors = validateDomainConfig({ ...domain, allowedEdges: [["adapter", "core"]] });
  assert.ok(errors.some((e) => /foundation/.test(e)), errors.join("; "));
});

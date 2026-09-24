<!--
Sync Impact Report
- Version change: (template, unversioned) → 1.0.0
- Modified principles: none (initial ratification)
- Added sections:
  - Core Principles: I. Simplicity First; II. Readable, Typed Code;
    III. Security by Default (NON-NEGOTIABLE); IV. Tests Prove Behaviour;
    V. Small, Reviewable Changes
  - Security Requirements
  - Development Workflow & Quality Gates
  - Governance
- Removed sections: none
- Templates requiring updates: none (plan/spec/tasks templates read the
  constitution at runtime; no placeholders in them reference removed content)
- Follow-up TODOs: none
-->

# Shotrn Constitution

## Core Principles

### I. Simplicity First

Every design and implementation choice MUST be the simplest one that satisfies the
current, written requirement.

- YAGNI applies: no feature, abstraction, configuration option, or layer is added for a
  need that is not in the active spec.
- Prefer a direct function over a class, a class over a framework extension, and a
  standard-library or platform primitive over a third-party dependency.
- New dependencies MUST be justified in the plan (`Complexity Tracking`) with the
  concrete simpler alternative that was rejected and why.
- Speculative generality (plugin systems, multi-backend adapters, "future-proof"
  interfaces with a single implementation) is prohibited until a second concrete use
  exists.

Rationale: a URL shortener is a small, well-understood problem. Complexity is the main
source of defects and security holes; keeping the surface minimal keeps it auditable.

### II. Readable, Typed Code

Code MUST be written to be read and maintained by someone who did not write it.

- Static typing is mandatory; `any`, unchecked casts, and disabled type checks require
  an inline comment explaining why no typed alternative exists.
- Names describe intent, not mechanics. Functions do one thing and fit on one screen;
  a function longer than ~40 lines or nested more than 3 levels MUST be split or
  justified in review.
- Linting and formatting are enforced by tooling, not by convention. A change that
  fails lint, format, or type-check MUST NOT be merged.
- Comments explain _why_, never _what_. Dead code, commented-out code, and unused
  exports are removed, not kept "just in case".
- Errors are handled explicitly at boundaries and never silently swallowed; every
  caught error is either handled, rethrown with context, or logged with enough detail
  to diagnose.

Rationale: readability is the cheapest form of quality. Typed, consistent code lets
reviewers and tooling catch mistakes before they reach production.

### III. Security by Default (NON-NEGOTIABLE)

The service accepts arbitrary user-supplied URLs and redirects the public to them. It
MUST be treated as an attack surface at every layer.

- All external input (HTTP bodies, query strings, headers, path parameters, environment
  variables) MUST be validated against an explicit schema at the boundary before use.
  Unvalidated data never reaches business logic or storage.
- Persisted or redirected URLs MUST be restricted to an explicit allow-list of schemes
  (`http`, `https`). `javascript:`, `data:`, `file:`, and any other scheme are rejected.
- Redirect targets are stored and emitted verbatim from the validated value; the
  service never constructs a redirect from user input at request time.
- Secrets (database credentials, API keys, salts) MUST be supplied via environment or a
  secret store and MUST NEVER be committed, logged, or returned in responses.
- Short identifiers MUST NOT be trivially enumerable in sequence; the identifier
  encoding MUST be non-guessable to a casual observer even if the underlying counter
  is sequential.
- Every public write endpoint MUST be rate-limited. Every response MUST carry
  baseline security headers (no-sniff, frame denial, strict referrer policy).
- Dependencies are pinned via lockfile and audited; a known high/critical vulnerability
  blocks the merge until resolved or explicitly risk-accepted in writing.
- Logs MUST NOT contain secrets, full request bodies, or personally identifying data
  beyond what is required to diagnose a failure.

Rationale: an open redirector is a phishing tool. Defence must be structural
(validation, allow-lists, headers) rather than relying on reviewer vigilance.

### IV. Tests Prove Behaviour

A change is not done until its behaviour is demonstrated by an automated test.

- Every user-facing behaviour in the spec maps to at least one test that fails
  without the change and passes with it.
- Security rules in Principle III (scheme allow-list, input validation, rate limiting,
  secret leakage) MUST have explicit negative tests: the test asserts rejection.
- Tests are deterministic, isolated, and runnable in one command with no network
  access and no manually provisioned state.
- Contract tests cover the HTTP surface (request/response shapes, status codes,
  redirect semantics). Unit tests cover pure logic (encoding, validation). Integration
  tests cover the storage boundary.
- Coverage numbers are a diagnostic, not a target; a missing test for a stated
  requirement is a blocking review finding regardless of the percentage.

Rationale: tests are the executable form of the spec. Without them, "simple" code
silently drifts and security guarantees erode on the next refactor.

### V. Small, Reviewable Changes

Work MUST be delivered in increments that a reviewer can fully understand in one
sitting.

- One change addresses one task from `tasks.md`. Unrelated refactors, formatting
  sweeps, and drive-by fixes go in their own change.
- Every change states what it does, why, and how it was verified. A change that cannot
  be described in three sentences is too large.
- Breaking changes to any public contract (HTTP API, database schema, identifier
  format) MUST include a migration path and MUST be called out explicitly.
- Reviewers verify compliance with this constitution as part of every review; a
  violation is a blocking finding, not a nit.

Rationale: small changes are where simplicity, quality, and security are actually
enforced. Large changes get skimmed, and skimmed changes ship bugs.

## Security Requirements

These constraints apply to the whole system regardless of stack choice and are
verified during planning (`Constitution Check`) and review.

- **Trust boundary**: the HTTP layer is the only trusted entry point. Anything crossing
  it is untrusted until validated. Internal modules assume validated input and MUST
  NOT re-implement validation.
- **URL handling**: maximum accepted URL length is defined once as a constant and
  enforced at the boundary. URLs are parsed with the platform URL parser, never with
  regular expressions alone. Hostnames resolving to loopback, link-local, or private
  ranges MAY be rejected when the deployment is internet-facing; the decision is
  recorded in the plan.
- **Identifiers**: short codes are generated server-side only. Clients MUST NOT choose
  or influence the generated code unless a custom-alias feature is explicitly
  specified, in which case aliases are validated against a strict character
  allow-list and a reserved-word deny-list.
- **Data at rest**: the database user used by the application has the minimum
  privileges required (no DDL at runtime). Schema changes are applied by versioned
  migrations, never by hand.
- **Transport**: production traffic is HTTPS only. Redirect responses use `301`/`302`
  deliberately per the spec, never a `200` with meta-refresh or script.
- **Abuse controls**: rate limits, request-size limits, and timeouts have explicit,
  documented values. Denial of one request MUST NOT affect another.
- **Disclosure**: error responses to clients contain a stable error code and a safe
  message; stack traces, SQL, and internal paths are never returned.

## Development Workflow & Quality Gates

- **Spec → Plan → Tasks → Implement**: no implementation starts without an approved
  spec and a plan whose `Constitution Check` passes or documents every deviation in
  `Complexity Tracking`.
- **Local gate (run before every push)**: type-check, lint, format check, and the full
  test suite MUST pass with a single documented command.
- **CI gate**: the same checks run on every change, plus dependency vulnerability
  audit. A red CI blocks merge; skipping or muting a failing check requires written
  justification in the change description.
- **Review gate**: at least one reviewer confirms (a) the change maps to a task,
  (b) tests cover the stated behaviour including negative security cases, (c) no
  principle is violated or every violation is justified.
- **Definition of done** for a task: code merged, tests green, documentation for any
  changed public contract updated, and the task marked complete in `tasks.md`.

## Governance

This constitution supersedes all other conventions, templates, and informal practices
in this repository. Where a template, tool default, or prior habit conflicts with a
principle here, the principle wins.

- **Amendments**: any change to this document is proposed as its own change with a
  rationale, reviewed like code, and recorded in the Sync Impact Report at the top of
  the file until committed. Amendments that weaken a security rule require an explicit
  risk statement.
- **Versioning**: semantic versioning applies to this document. MAJOR for removing or
  redefining a principle in a backward-incompatible way; MINOR for adding a principle
  or section or materially expanding guidance; PATCH for clarifications and wording.
- **Compliance review**: every plan's `Constitution Check` and every code review MUST
  cite this document. Unjustified complexity, missing validation, or missing tests are
  blocking findings.
- **Runtime guidance**: agent- and developer-facing operational guidance lives in the
  repository's agent context file (e.g. `CLAUDE.md`); it MUST NOT contradict this
  constitution and is updated when the constitution changes.

**Version**: 1.0.0 | **Ratified**: 2026-09-21 | **Last Amended**: 2026-09-21

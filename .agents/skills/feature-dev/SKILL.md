---
name: feature-dev
description: Create implementation plans for multi-file code changes by exploring the repository, resolving ambiguities, designing the architecture, mapping exact files, and defining verification. Use before changing features, cross-module behavior, APIs, data flows, permissions, migrations, or unfamiliar code; skip trivial one-line fixes and urgent hotfixes.
---

# Feature Development Planning

Use this workflow when a code change needs a reliable implementation map before coding. It is a plan-only adaptation of Anthropic's official Claude Code `feature-dev` workflow, expressed in the portable Agent Skills format.

## Scope

- Produce an implementation plan; do not implement the application change as part of this Skill.
- Keep the proposed change focused on the requested outcome and record unrelated findings as deferred work.
- Preserve unrelated working-tree changes while inspecting the repository.
- Use the host agent's available file, search, shell, and task-list tools; do not assume Claude-specific commands or agents exist.

## Phase 1: Discover the request

1. Read applicable repository instructions and project documentation.
2. Inspect the current repository state, relevant modules, recent related changes, and existing tests.
3. Restate the goal, expected outcome, constraints, non-goals, and success criteria.
4. Identify ambiguities that could change scope, behavior, compatibility, or verification. Ask focused questions when an answer is necessary; otherwise record the smallest explicit assumption.

## Phase 2: Explore the codebase

Trace existing behavior instead of designing from filenames alone.

- Find the closest existing feature or flow and trace its entry point, call chain, transformations, persistence, and visible result.
- Search for routes, components, handlers, services, schemas, migrations, tests, and callers with the host's repository search tools.
- Read the relevant files and record important findings with exact file paths and line references.
- Separate observed code facts from assumptions.
- Identify existing patterns and extension points to reuse, plus files that should remain out of scope.

Produce a concise findings map:

```text
Existing flow: entry → transformation → persistence/API → visible result
Patterns to reuse: exact file:line references
Files that must change: exact path + responsibility
Files that stay unchanged: out-of-scope boundary
Open decisions: only blocking questions
```

## Phase 3: Choose the architecture

When there is a meaningful design choice, compare at most three approaches:

1. Minimal change: maximum reuse and smallest regression surface.
2. Pragmatic balance: a clear boundary without unrelated refactoring.
3. Clean separation: only when the existing boundary is the confirmed source of risk.

Recommend one approach using the repository's current patterns, risk, and delivery needs. State the trade-off and what the recommendation deliberately does not solve. Do not add an abstraction merely because it looks cleaner.

## Phase 4: Write the implementation plan

Save the plan under the repository's established plan directory, preferably `docs/plans/YYYY-MM-DD-<short-slug>.md` when no project convention overrides it. The plan must be executable by an engineer who did not perform the exploration.

Required contents:

1. Goal and expected outcome.
2. Scope and explicit non-goals.
3. Current-state findings with file and line references.
4. Chosen approach and rejected alternatives.
5. Exact file map:
   - Create: path and responsibility
   - Modify: path, symbol or section, and intended change
   - Test: path, scenario, and expected assertion
   - Migration, configuration, or documentation: path and dependency when applicable
6. Ordered implementation phases with checkbox tasks. Each task has one action, dependencies, and a completion condition.
7. Data flow or state transition for changes that cross modules, APIs, persistence, or lifecycle states.
8. Error, empty, unauthorized, compatibility, and rollback behavior when relevant.
9. Verification checklist with exact commands or observable checks.
10. Risks, unresolved decisions, deferred work, and final acceptance criteria.

Use concrete file paths, symbols, inputs, expected behavior, commands, and outcomes. Do not use vague steps such as “add validation”, “test the flow”, or “handle edge cases”. Do not invent paths, functions, fields, accounts, data, or successful results.

## Phase 5: Review and handoff

Before handing off the plan:

- Map every requirement to one or more plan tasks.
- Check that referenced files, functions, fields, routes, and commands exist or are explicitly marked for creation.
- Remove placeholders, duplicate tasks, contradictory names, and scope expansion.
- Confirm that each verification step can prove the behavior it claims to verify.
- Report the plan path, coverage, exclusions, assumptions, and unresolved questions.


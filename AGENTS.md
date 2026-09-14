# Working in roblox-ts

roblox-ts compiles a supported subset of TypeScript into Luau for Roblox. Correct runtime behavior and readable,
source-faithful Luau are both requirements. Users read the output when debugging; unnecessary temporaries and
changes to literal spelling matter even when execution is equivalent.

## Working agreements

- Complete the requested scope through applicable implementation, validation, and final diff review. Fix failures
  introduced by the change. If blocked, finish independent work and report the specific blocker and unfinished validation.
- Make routine, reversible decisions without asking again. Ask when missing information materially changes the
  outcome or authorization and cannot be inferred from the request or existing context.
- Keep work local unless the user authorizes the relevant external action: pushing, opening a PR, posting a GitHub
  comment or review, merging a PR, or publishing a release. Local reviews, isolated checkouts, and temporary merges for
  validation are allowed within the requested task. Continue within authorization already given.
- Check the branch, worktree, and existing diff before editing. Preserve unrelated work. Use isolated worktrees
  when building, running, or modifying multiple revisions; read-only diffs do not require one. Preserve a checkpoint
  before a risky refactor or rebase.
- Keep changes focused. Extract shared logic where it has real callers. Avoid speculative abstractions, unrelated
  dependency upgrades, and incidental formatting changes.

## Finding the relevant code

The pipeline is TypeScript source → TypeScript AST/type checker → Luau AST → rendered Luau.
`src/CLI/` handles commands; `src/Project/` coordinates compilation; `src/TSTransformer/` lowers syntax and macros;
`src/Shared/` owns options, diagnostics, and shared utilities; `include/` contains runtime support.

Use the references that apply to the task:

- For setup or test execution, use [CONTRIBUTING.md](CONTRIBUTING.md#running-tests). For new regressions, use its
  [test guidance](CONTRIBUTING.md#writing-regression-tests).
- For unfamiliar compiler boundaries, use the [pipeline map](docs/compiler.md#pipeline-and-entry-points).
  For prerequisite placement, use [evaluation order](docs/compiler.md#prerequisites-and-evaluation-order).
- For macro operands or temporary elimination, use [macro evaluation](docs/macro-evaluation.md).
  For value counts, strings, imports, state, or upgrades, use the matching section of the [compiler guide](docs/compiler.md).
- For compile-time performance work, use the [benchmark guidance](docs/compiler.md#compiler-performance).

Read the relevant callers, helpers, and tests when changing behavior. Trace a compiler reproducer from TypeScript
through emitted Luau to runtime behavior. Prefer current implementation and configuration when older READMEs disagree.
Use `package.json` for scripts and versions, `foreman.toml` for tool pins, and `.github/workflows/` for CI behavior.

## Compiler quality and validation

- Preserve source evaluation order, branch and loop placement of prerequisites, and Luau value counts. An identifier
  can be mutable; parentheses and temporaries can be required for correctness. Preserve written string escapes through
  the existing literal helpers. The compiler guide describes these contracts and their implementation entry points.
- Prefer source-level runtime regressions in `tests/src/`, diagnostics for invalid source, and exact-emit snapshots
  in `tests/compiler/` for output quality. Add runtime assertions and snapshots when both behavior and emit can regress.
- For compiler or runtime behavior changes, build before focused validation, run focused regressions while iterating,
  then run `npm test` and `npm run eslint` on the final code. `npm test` includes the build, Jest, Rojo, and Lune stages.
- A focused snapshot run does **not** refresh the complete runtime output. Before running Rojo and Lune separately,
  compile the runtime project with `tests/compiler/compile.test.ts` or the full Jest suite.
- For documentation-only changes, check formatting, referenced paths, and the diff. Compiler tests are unnecessary.
  Repeat or broaden completed checks only when subsequent changes, failures, or unresolved concerns require it.
- Meet the patch coverage requirement in `codecov.yml`. Prefer source-level regressions and investigate uncovered
  branches without fabricating internal states or weakening the threshold. Check existing coverage before adding cases.

## Code and comment style

Follow `.prettierrc`, `.editorconfig`, and `eslint.config.ts` for formatting, imports, and lint rules. Preserve these
additional conventions in new or edited code:

- Always use braces for `if`, `else`, and loop bodies, including single-line early returns, `continue`, and `break`.
  Keep ordinary `else if` chains without an extra enclosing block.
- Separate logical stages with blank lines in functions and tests. Keep closely related statements together and
  comments adjacent to the code they explain.
- Comments start lowercase unless the first identifier is capitalized, and have no ending punctuation. Explain why,
  a non-obvious invariant, or an edge case. Preserve useful explanations and describe current behavior.
- Favor readable stages and well-named helpers. Measure a suspected performance cost before sacrificing maintainability.
  Use narrowing or optional chaining when absence is valid, and assertions for established invariants; do not add
  non-null assertions merely to suppress uncertainty.
- Keep generated output (`out/`, `tests/out/`, `tests/include/`, coverage, and `.rbxl` files) out of source changes.
  Edit TypeScript test sources, not their generated Luau. `CLAUDE.md` contains only `@AGENTS.md`.

## Reporting and PRs

Report the outcome, relevant validation, and remaining limitations plainly. Distinguish observed results from
assumptions; never report an unrun check as passing. For a bug finding, give a concrete trigger, consequence, and
precise code location.

When a PR is requested, keep its title and description brief and specific to the final change. Explain the problem,
resulting behavior, and relevant validation. Include a small before/after Luau example or concrete walkthrough when
useful. Update the description when scope changes. Identify unreleased dependency prerequisites and keep dependent
work draft until they are available.

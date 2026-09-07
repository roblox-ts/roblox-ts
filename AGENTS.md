# Working in roblox-ts

roblox-ts compiles a supported subset of TypeScript into Luau for Roblox. Correct runtime behavior and readable,
source-faithful Luau are both requirements. Users read the output when debugging; unnecessary temporaries and
changes to literal spelling matter even when execution is equivalent.

## Working agreements

- Carry authorized work through implementation, validation, and review. Make routine, reversible decisions without
  repeatedly asking for confirmation. Ask when missing information materially changes the outcome or authorization.
- Keep work local unless publication is requested. “Keep everything local” includes no pushes, PRs, GitHub comments,
  reviews, merges, or releases. Continue within authorization already given in the current task.
- Check the branch, worktree, and existing diff before editing. Preserve unrelated work. Use an isolated worktree
  when comparing branches, and preserve a checkpoint before a risky refactor or rebase.
- Read the relevant callers, helpers, and tests before changing a transform. Trace a reproducer from TypeScript
  source through emitted Luau to runtime behavior. Verify historical assumptions against the current checkout.
- Keep changes focused. Extract shared logic where it has real callers; avoid speculative abstractions, unrelated
  dependency upgrades, broad documentation rewrites, and incidental formatting changes.
- Report the outcome, relevant validation, and any remaining limitations plainly. Prefer concrete examples over
  jargon or elaborate headings. Distinguish observed results from assumptions.

## Repository map

The main pipeline is TypeScript source → TypeScript AST/type checker → Luau AST → rendered Luau.

| Area                                                | Responsibility and useful entry points                                                                                                                                                                                             |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/CLI/`                                          | Argument parsing and terminal behavior. `cli.ts` loads commands; `commands/build.ts` drives normal and watch builds. Shared compilation behavior belongs in Project.                                                               |
| `src/Project/`                                      | Configuration, program creation, plugins, Rojo/path resolution, copying, cleanup, and emission. Start with `functions/compileFiles.ts`.                                                                                            |
| `src/Project/classes/VirtualProject.ts`             | In-memory compilation used by the playground and compiler snapshots, backed by `VirtualFileSystem.ts`. Preserve this path alongside filesystem builds.                                                                             |
| `src/Project/functions/setupProjectWatchProgram.ts` | Incremental builds and file lifecycle. Also inspect `createProgramFactory.ts` and `getChangedFilePaths.ts` for invalidation and dependent files.                                                                                   |
| `src/TSTransformer/nodes/`                          | Syntax lowering. `transformSourceFile.ts` handles module wrapping; `expressions/transformExpression.ts` and `statements/transformStatement.ts` dispatch by syntax kind. Binding, class, and JSX transforms have their own folders. |
| `src/TSTransformer/classes/`                        | `TransformState` owns per-file transformation context and prerequisite statements; `MultiTransformState` owns caches for one compilation; `MacroManager` binds macros to TypeScript symbols.                                       |
| `src/TSTransformer/macros/`                         | Identifier, constructor, call, and property-call macros. Array, map, set, string, and Roblox arithmetic methods are expanded here.                                                                                                 |
| `src/TSTransformer/util/`                           | Shared lowering rules: evaluation order, type classification, truthiness, imports, assignments, tuples, and string conversion.                                                                                                     |
| `src/Shared/`                                       | Options and defaults, diagnostic factories, errors, logging, and common utilities.                                                                                                                                                 |
| `include/`                                          | Shipped Luau runtime support: `RuntimeLib.lua` and the bundled `Promise.lua`. Helpers requested through `state.TS(...)` must agree with this runtime.                                                                              |
| `tests/compiler/`                                   | Node/Jest tests for compilation, diagnostics, and exact emitted output.                                                                                                                                                            |
| `tests/src/`                                        | A separate roblox-ts project containing TestEZ runtime tests, diagnostic fixtures, and supporting modules.                                                                                                                         |
| `.github/workflows/`                                | Build, lint, runtime tests, playground compatibility, template-project integration, and publishing.                                                                                                                                |

Luau AST construction and rendering live in the separate `@roblox-ts/luau-ast` package. Filesystem translation and
Rojo resolution likewise come from `@roblox-ts/path-translator` and `@roblox-ts/rojo-resolver`. Fix issues at the
appropriate layer; verify a dependency release is available before relying on its new API.

`CONTRIBUTING.md` explains development setup. Prefer current implementation and configuration when older subsystem
READMEs disagree. Read versions and scripts from `package.json`, tool pins from `foreman.toml`, and CI behavior from
the workflows rather than assuming a remembered version or command.

When adding a compiler option, check `src/Shared/types.ts`, `DEFAULT_PROJECT_OPTIONS` in `src/Shared/constants.ts`,
CLI flags, and VirtualProject together. Plugin changes also need the reprint/rebind path in `compileFiles.ts`:
transformed TypeScript nodes cannot be assumed to retain valid symbol or type information.

## Setup and validation

Run commands from the repository root. The compiler and `tests/` have separate npm dependencies.

| Command                                                                   | Purpose                                                                                                                                             |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci`                                                                  | Install the root dependencies from the lockfile on a fresh checkout.                                                                                |
| `npm run update-test-types`                                               | Install/refresh the test project's compiler types and Roblox types, as CI does. This can change test package metadata; review that diff separately. |
| `rokit install`                                                           | Install the pinned Rojo/Lune tools described in the contributor guide and `foreman.toml`.                                                           |
| `npm run build`                                                           | Build the compiler's TypeScript project references with `tspc -b`, including the configured path transforms.                                        |
| `npm run build-watch`                                                     | Rebuild compiler sources while editing.                                                                                                             |
| `npm run test-compile`                                                    | Run Jest with coverage, check snapshots and diagnostics, and compile the runtime test project.                                                      |
| `npm run test-compile -- tests/compiler/strings.test.ts`                  | Example of running one compiler test file.                                                                                                          |
| `npm run test-compile -- tests/compiler/strings.test.ts --updateSnapshot` | Update that suite's snapshots for an intentional emit change. Review the generated diff.                                                            |
| `npm run test-rojo`                                                       | Build `tests/test.rbxl` from the compiled test project.                                                                                             |
| `npm run test-run`                                                        | Execute that place's TestEZ tests through Lune.                                                                                                     |
| `npm test`                                                                | Build → all Jest tests → Rojo → Lune. Use for compiler/runtime behavior changes.                                                                    |
| `npm run eslint`                                                          | Run lint with zero warnings allowed.                                                                                                                |
| `git diff --check`                                                        | Check patch whitespace before finishing.                                                                                                            |

Build before validating compiler changes. A focused snapshot run does **not** refresh the complete runtime output;
run `tests/compiler/compile.test.ts` or the full Jest suite before running Rojo and Lune separately. Inspect generated
files under `tests/out/`, but change their TypeScript sources rather than editing the output.

For documentation-only changes, check formatting, paths, and the diff; a compiler test run is unnecessary. For
behavior changes, run focused regressions while iterating, then `npm test` and lint. Repeat or broaden checks only
when a change, failure, or unresolved concern warrants it. Never report an unrun check as passing.

If dependency setup fails, inspect the actual npm error and installed test types before diagnosing a compiler bug.
Test dependencies include Git sources; npm versions that require explicit Git permission may need
`--allow-git=root` on the relevant install command. Roblox type recognition uses declaration paths, so symlinking
`tests/node_modules` from another worktree can change behavior; install or copy dependencies into that worktree.

## Regression tests

- Prefer programs users can write. Add runtime cases to `tests/src/tests/*.spec.ts` and supporting files to
  `tests/src/helpers/` or the relevant existing fixture folder. Follow neighboring TestEZ tests. Cover evaluation
  order with observable side effects, not just the final value.
- Add invalid-source cases to `tests/src/diagnostics/<diagnosticName>.ts`, or `.1.ts`, `.2.ts`, etc. The harness resolves
  the name against `errors` in `src/Shared/diagnostics.ts` and requires the expected diagnostic without unrelated ones.
- For output quality, use `createTestProject()` from `tests/compiler/createTestProject.ts` and snapshot the complete
  `compileSource()` result, removing only the compiler version header as existing suites do. Keep subject-specific
  suites in `tests/compiler/`; reusable TypeScript input fixtures go in `tests/compiler/fixtures/`.
- Runtime assertions establish behavior; snapshots establish exact spelling, parentheses, and temporary placement.
  Add both when both can regress. A snapshot alone does not prove the output parses or runs.
- Keep snapshot cases alphabetized by test name to match Jest's snapshot ordering. Let Jest generate `.snap` files;
  review every intentional change instead of manually arranging snapshots or accepting updates blindly.
- Confirm a regression test exercises the original bug, preferably by demonstrating failure before the fix. Avoid
  tests coupled to private analysis structures or fabricated internal states just to increase coverage.
- Check `codecov.yml` for the patch coverage requirement, currently 95%. Prefer covering remaining branches through
  source-level runtime cases. When pursuing 100%, investigate apparently unreachable branches rather than inventing
  an internal-only test or weakening the threshold. Check existing coverage before adding redundant cases.

Lune runs a Roblox simulation with shims in `tests/runTestsWithLune.lua`; it does not establish full engine behavior.
For an engine-specific issue, verify the actual API and use an appropriate Roblox integration check.

## Compiler invariants and common traps

- **Prerequisites and evaluation order:** `state.capture()` returns an expression and its prerequisite statements;
  `state.prereq()` / `state.prereqList()` emit them into the enclosing capture. Keep prerequisites in the correct
  branch, loop iteration, and source evaluation order. Start with `ensureTransformOrder.ts`, `transformWritable.ts`,
  and `transformCallExpression.ts` when changing captures. Calls also pass through `transformOptionalChain.ts`.
- **Macro operands:** Macros can reorder, repeat, or discard inputs and invoke callbacks. Removing a temporary needs
  evidence that reads, writes, receiver rebinding, errors, conditional execution, and allocation identity remain
  correct. A simple identifier can still be mutable. Inspect both used-result and statement-only forms.
- **Luau value counts:** Multiple returns, `LuaTuple`, varargs, and zero-return calls are context-sensitive.
  Parentheses can intentionally force one value or `nil`: `tonumber(foo())` can error if `foo` returns no values.
  Preserve the contracts in `wrapReturnIfLuaTuple.ts` and `fixVoidArgumentsForRobloxFunctions`.
- **Truthiness and indexing:** Luau treats `0` and `""` as truthy. Use the shared truthiness helpers for TypeScript
  conditions. TypeScript arrays need index offsets; numeric keys on ordinary objects do not. Reuse the type and
  indexing helpers rather than applying either rule by syntax alone.
- **Types and state:** Use symbol identity and existing union/intersection/constraint helpers. Keep TypeScript
  node/type/symbol caches within their program or compilation lifetime. Preserve diagnostics and their locations
  when caching results. `DiagnosticService` is shared mutable state and must be flushed at compilation boundaries.
- **Strings:** Use `createStringFromLiteral.ts` for source literals, including template parts and string-named
  imports/exports through the existing transform helpers. Preserve written escapes with `node.getText()`; decoded `node.text`
  can lose spelling or change escape meaning. `luau.string()` receives escaped content; it is not a general-purpose
  TypeScript string escaper. Avoid double escaping. Check the renderer contract when changing delimiters or spacing.
- **Modules and projects:** Import/export changes affect type-only elision, aliases, mutable exports, re-exports,
  package entry points, and Rojo network/isolation rules. Trace `createImportExpression.ts`, the import/export
  transforms, `transformSourceFile.ts`, and TransformState's module mappings together.
- **Optimizations:** Prove eligibility before emitting optimized code and retain the fallback. For loops, test both
  `optimizedLoops` settings: Luau numeric-for bounds are evaluated once, which can differ from a TypeScript condition.
- **Upgrades:** Keep TypeScript and the `@types/ts-expose-internals` alias aligned. The alias intentionally targets the
  maintained `@roblox-ts/ts-expose-internals` fork. Test newly accepted syntax as well as old cases, inspect emitted
  Luau, and exercise parsing/runtime behavior; a green pre-existing suite can miss a new syntax path.

## Code and comment style

- Follow `.prettierrc`, `.editorconfig`, and `eslint.config.ts`: tabs, double quotes, semicolons, trailing commas,
  and `Array<T>` / `ReadonlyArray<T>`. Source imports use project aliases such as `TSTransformer/...` and `Shared/...`;
  relative imports are allowed in `tests/compiler/`. Let the import sorter arrange imports.
- New or edited comments start lowercase unless the first identifier is capitalized, and have no ending
  punctuation. Explain **why**, a non-obvious invariant, or a concrete edge case; avoid narrating obvious code.
- Preserve useful existing explanations such as the zero-return `tonumber(foo())` example. Describe current
  behavior, not the implementation removed by the patch. Avoid decorative separators and abstract pseudocode blocks.
- Favor readable stages and well-named helpers. A sequence of `text = text.replace(...)` steps can be clearer than
  one dense regex or chain. Measure a suspected performance cost before sacrificing maintainability.
- Use narrowing or optional chaining when absence is valid; use assertions when an invariant has been established.
  Do not add non-null assertions merely to suppress uncertainty about a TypeScript API.
- Keep generated output (`out/`, `tests/out/`, `tests/include/`, coverage, and `.rbxl` files) out of source changes.
  Keep this guide focused on durable repository guidance; `CLAUDE.md` contains only `@AGENTS.md`.

## Reviews, performance work, and PRs

Review the final diff as a maintainer would: source behavior, exact emit, diagnostics, regressions, and readability.
For a bug finding, provide a concrete trigger, consequence, and precise code location. Keep local reports and
experiments local when requested.

For compiler performance work, compare the same source and dependencies with clean, rebuilt compiler versions.
Separate cold/warm and incremental runs, repeat measurements, and distinguish compile time from generated-program
runtime. Use a representative project when available, inspect before/after emit, and profile before optimizing
unrelated hot paths. Do not claim a meaningful speedup from timing noise. Split unrelated optimizations into
independently reviewable PRs based on the repository's actual target branch.

When a PR is requested, keep its title and description brief and specific to the final change. Explain the problem
and resulting behavior, add a small before/after Luau example when useful, and state relevant validation. For a
non-obvious algorithm, use a short concrete walkthrough such as `array.push(value())`. Update the description when
scope changes. Identify an unreleased dependency prerequisite and keep dependent work draft until it is available.

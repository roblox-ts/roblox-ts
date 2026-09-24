# Compiler Guide

Use the sections relevant to the behavior being changed. Test setup and regression conventions are in
[CONTRIBUTING.md](../CONTRIBUTING.md#running-tests).

## Pipeline and Entry Points

The pipeline is TypeScript source → TypeScript AST/type checker → Luau AST → rendered Luau.

- [CLI](../src/CLI/) handles argument parsing and terminal behavior. `cli.ts` loads commands;
  [commands/build.ts](../src/CLI/commands/build.ts) drives normal and watch builds. Shared compilation behavior belongs
  in Project.
- [Project](../src/Project/) handles configuration, program creation, plugins, Rojo/path resolution, copying, cleanup,
  and emission. Start with [compileFiles.ts](../src/Project/functions/compileFiles.ts).
  [VirtualProject](../src/Project/classes/VirtualProject.ts) and
  [VirtualFileSystem](../src/Project/classes/VirtualFileSystem.ts) support in-memory compilation for the playground
  and compiler snapshots; preserve this path alongside filesystem builds.
- For incremental builds and file lifecycle, inspect
  [setupProjectWatchProgram.ts](../src/Project/functions/setupProjectWatchProgram.ts),
  [createProgramFactory.ts](../src/Project/functions/createProgramFactory.ts), and
  [getChangedFilePaths.ts](../src/Project/functions/getChangedFilePaths.ts).
- [Syntax transforms](../src/TSTransformer/nodes/) lower TypeScript nodes.
  [transformSourceFile.ts](../src/TSTransformer/nodes/transformSourceFile.ts) handles module wrapping;
  [transformExpression.ts](../src/TSTransformer/nodes/expressions/transformExpression.ts) and
  [transformStatement.ts](../src/TSTransformer/nodes/statements/transformStatement.ts) dispatch by syntax kind.
  Binding, class, and JSX transforms have their own folders.
- [TransformState](../src/TSTransformer/classes/TransformState.ts) owns per-file context;
  [Prereqs](../src/TSTransformer/classes/Prereqs.ts) owns an explicit statement destination;
  [MultiTransformState](../src/TSTransformer/classes/MultiTransformState.ts) owns caches for one compilation;
  [MacroManager](../src/TSTransformer/classes/MacroManager.ts) binds macros to TypeScript symbols.
- [Macros](../src/TSTransformer/macros/) expand identifier, constructor, call, and property-call operations.
  [Transformer utilities](../src/TSTransformer/util/) share evaluation, type, truthiness, indexing, assignment,
  import, tuple, and string rules.
- [Shared](../src/Shared/) contains options, defaults, diagnostic factories, errors, logging, and common utilities.
  [RuntimeLib.luau](../include/RuntimeLib.luau) and [Promise.luau](../include/Promise.luau) provide shipped runtime
  support. Helpers requested through `state.TS(...)` must agree with this runtime.

Luau AST construction and rendering live in the separate `@roblox-ts/luau-ast` package. Filesystem translation and
Rojo resolution likewise come from `@roblox-ts/path-translator` and `@roblox-ts/rojo-resolver`. Fix issues at the
appropriate layer; verify a dependency release is available before relying on its new API.

## Prerequisites and Evaluation Order

Pass an explicit `Prereqs` collector to transforms that emit caller prerequisites. Create a separate `new Prereqs()`
for each statement destination, then attach its `.statements` to the appropriate branch, loop, or enclosing list.
`prereqs.push()` and `prereqs.pushList()` append to that collector. Pass the intended collector explicitly through
callbacks instead of closing over an outer one. Statement transforms return their complete statement lists,
with any prerequisite collectors kept local.

Assemble final output in plain Luau lists; append each collector after its collection phase is complete,
since `luau.list.pushList()` consumes the appended list. Thin forwarding helpers may return `.statements` directly.
Keep prerequisites in the correct branch, loop iteration, and source evaluation order.

When changing destinations, inspect [ensureTransformOrder.ts](../src/TSTransformer/util/ensureTransformOrder.ts),
[transformWritable.ts](../src/TSTransformer/nodes/transformWritable.ts), and
[transformCallExpression.ts](../src/TSTransformer/nodes/expressions/transformCallExpression.ts).
Calls also pass through [transformOptionalChain.ts](../src/TSTransformer/nodes/transformOptionalChain.ts).

## Macro Operands

Macros can reorder, repeat, or discard inputs and invoke callbacks. Removing a temporary needs evidence that reads,
writes, receiver rebinding, errors, conditional execution, and allocation identity remain correct. A simple identifier
can still be mutable. Inspect both used-result and statement-only forms.

For operand handling and temporary elimination, use [Macro evaluation](macro-evaluation.md), which describes the
operand contract, effect analysis, and relevant source-level tests.

## Value Counts, Truthiness, and Indexing

Multiple returns, `LuaTuple`, varargs, and zero-return calls are context-sensitive. Parentheses can intentionally force
one value or `nil`: `tonumber(foo())` can error if `foo` returns no values. Preserve the contracts in
[wrapReturnIfLuaTuple.ts](../src/TSTransformer/util/wrapReturnIfLuaTuple.ts) and `fixVoidArgumentsForRobloxFunctions`
in [transformCallExpression.ts](../src/TSTransformer/nodes/expressions/transformCallExpression.ts).

Luau treats `0` and `""` as truthy. Use the shared truthiness helpers for TypeScript conditions. TypeScript arrays need
index offsets; numeric keys on ordinary objects do not. Reuse the type and indexing helpers rather than applying
either rule by syntax alone.

## Strings

Use [createStringFromLiteral.ts](../src/TSTransformer/util/createStringFromLiteral.ts) for source literals, including
template parts and string-named imports/exports through the existing transform helpers. Preserve written escapes with
`node.getText()`; decoded `node.text` can lose spelling or change escape meaning. `luau.string()` receives escaped
content; it is not a general-purpose TypeScript string escaper. Avoid double escaping. Check the renderer contract
when changing delimiters or spacing.

## Modules and Projects

Import/export changes affect type-only elision, aliases, mutable exports, re-exports, package entry points, and Rojo
network/isolation rules. Trace [createImportExpression.ts](../src/TSTransformer/util/createImportExpression.ts),
the import/export transforms, [transformSourceFile.ts](../src/TSTransformer/nodes/transformSourceFile.ts), and
TransformState's module mappings together.

When adding a compiler option, check [src/Shared/types.ts](../src/Shared/types.ts), `DEFAULT_PROJECT_OPTIONS` in
[src/Shared/constants.ts](../src/Shared/constants.ts), CLI flags, and VirtualProject together. Plugin changes also need
the reprint/rebind path in [compileFiles.ts](../src/Project/functions/compileFiles.ts): transformed TypeScript nodes
cannot be assumed to retain valid symbol or type information.

## Types and Diagnostics

Use symbol identity and existing union/intersection/constraint helpers. Keep TypeScript node/type/symbol caches
within their program or compilation lifetime. Preserve diagnostics and their locations when caching results.
`DiagnosticService` is shared mutable state and must be flushed at compilation boundaries.

## Optimizations and Upgrades

Prove eligibility before emitting optimized code and retain the fallback. For loops, test both `optimizedLoops`
settings: Luau numeric-for bounds are evaluated once, which can differ from a TypeScript condition.

Keep TypeScript and the `@types/ts-expose-internals` alias aligned. The alias intentionally targets the maintained
`@roblox-ts/ts-expose-internals` fork. Test newly accepted syntax as well as old cases, inspect emitted Luau, and
exercise parsing/runtime behavior; a green pre-existing suite can miss a new syntax path.

## Compiler Performance

Compare the same source and dependencies with clean, rebuilt compiler versions. Separate cold/warm and incremental
runs, repeat measurements, and distinguish compile time from generated-program runtime. Use a representative project
when available, inspect before/after emit, and profile before optimizing unrelated hot paths.

Do not claim a meaningful speedup from timing noise. Split unrelated optimizations into independently reviewable
PRs based on the repository's actual target branch.

# Macro evaluation

A source operand lowers to prerequisite statements and a residual expression.
Source evaluation order is `P0 E0 P1 E1 ... Pn En`, followed by the operation.
Inlining an expression must preserve observable reads, writes, errors, termination,
and allocation identity.

## Macro contract

Macros receive opaque operand references, not the operands' computations.
They may embed each reference wherever its value is needed, but must not assign
to it, decompose nonliteral syntax, or transform its source expression again.
Literal operands remain visible for decisions such as `typeIs`'s builtin selection.
Use `pushToVar` for macro-owned working state or shared derived computations.

The macro runs once. This avoids speculative diagnostics and ensures the expansion
being analyzed is the one eventually emitted. Each operand has a distinct reference
even if its input AST object is shared. Temporary-identifier IDs and value annotations
survive the AST library's shallow cloning.

## Implementation

- `transformMacroCall.ts` lowers operands and tuple spreads. Scalar calls that may
  return no values are parenthesized to preserve one-argument arity.
- `evaluation/events.ts` walks the expansion in Luau execution order, recording
  effects and operand uses. Conditional or repeated uses cannot assume an argument
  is evaluated exactly once. Source callbacks remain opaque operands; the walker
  only handles control flow introduced by macros, asserting unsupported shapes.
- `evaluation/plan.ts` decides captures, emits prerequisites in source order, and
  substitutes the actual values. Substitution restores indexability and arithmetic
  folding that opaque references temporarily hide.
- `evaluation/effects.ts` summarizes emitted code and checks whether evaluations
  can exchange positions. Unknown operations are conservative.
- `evaluation/facts.ts` attaches binding identity, primitive-value information,
  stable lookups, and known call effects to AST nodes.
- `evaluation/bindings.ts` tracks references and assignments across function boundaries.
  `evaluation/builtins.ts` recognizes native declarations without trusting spelling.

Capture decisions run backward through source operands. A later capture becomes
a prerequisite that all earlier operands must also cross. The analysis checks
both this hoisted work and the operations before the operand's emitted uses.

An unused operand still executes if it can write or fail. Repeated allocations
need captures even without observable writes: two fresh tables are not one value.
General-purpose compiler temporaries are not assumed immutable.

## Luau evaluation order

Luau can read a local's register at the consuming instruction, after a neighboring
expression has executed. This affects arithmetic, comparisons, computed accesses,
and assignment bases and keys. Complex assignment bases and keys, however, already
evaluate before an inline RHS. Hoisted prerequisites precede both kinds of reference.

`ensureTransformOrder` applies the same effect checks to ordinary prerequisite
hoisting. The expression and assignment transforms account for late register reads
and preserve callable-property lookups before argument prerequisites. A compound
assignment may need separate snapshots of its target and its old value.

## Safety boundaries

Unknown calls can read captured bindings and rebind those written by closures.
Explicit writes still conflict with uncaptured bindings and compiler temporaries.
Stable references such as `self` and imports do not imply immutable objects.

Function summaries use emitted bodies, including lowered defaults and nested macros.
Invocation-local parameters and variables are excluded; captured writes remain.
Forward references, recursion, mutable function bindings, async functions, and
generators retain conservative behavior where no summary is available.

Stable member lookup is distinct from safe invocation. Native methods can retain
`:Method(...)` dispatch while their calls remain effectful. Optional-chain facts
apply inside the emitted nil guard. Compiler-owned `table.find` has a stable lookup,
but searching may invoke `__eq`. Likewise, table types alone do not rule out
`__index`, `__newindex`, `__len`, `__iter`, or `__tostring`. Instance writes
can invoke immediate signal handlers.

Builtin contracts belong to recognized declarations or compiler-owned references,
never names alone. Math RNG operations remain effectful; `clamp` and potentially
empty `min`/`max` calls retain their error effects. New contracts need both runtime
ordering tests and exact-emit coverage.

## Verification

`tests/compiler/emit.test.ts` checks exact output, with named source cases in
`tests/compiler/fixtures/macroEvaluation.ts` and Jest snapshots in `__snapshots__/`.
`tests/src/tests/evaluationOrder.spec.ts` and `macroEvaluation.spec.ts` cover
runtime ordering, errors, metamethods, mutation, arity, and allocation identity.
Prefer these source-level tests to fabricated ASTs or mocked transformer state.
Invalid source belongs in `tests/src/diagnostics/`; emit snapshots complement
runtime assertions by checking that required captures stay and unnecessary ones do not.
Run `npm test` for the compiler, Rojo build, and Lune runtime suite.

This is a conservative structured analysis, not a general control-flow optimizer.
Whole-program alias analysis, recursive summary fixpoints, engine-specific purity,
and global dead-code or register-allocation optimization are outside its scope.

# Evaluation Order & Macro System Redesign

This document describes a first-principles redesign of the machinery that keeps
TypeScript's expression evaluation order intact when compiling to Luau:
`ensureTransformOrder`, `expressionMightMutate`, `runCallMacro`, and the macro
definitions themselves (`propertyCallMacros`, `callMacros`, `constructorMacros`).

The goal is a single, principled model that:

1. preserves *exact* TypeScript evaluation order (including effect/error
   interleaving), and
2. emits a temporary variable **only when the model can prove one is needed**,
   instead of "whenever anything downstream produced a statement".

## 1. The problem, from first principles

TypeScript guarantees left-to-right evaluation of subexpressions. Luau also
evaluates expressions left-to-right, so as long as a TS expression maps to a
single Luau expression, order is free.

The problem appears when a subexpression cannot be represented as a Luau
expression and must instead be *lowered to statements* ("prereqs") plus a
result expression. Transforming a sequence of sibling operands
`e₁, e₂, …, eₙ` yields for each a pair:

```
eᵢ  ⟶  (Sᵢ, Rᵢ)        Sᵢ = prereq statements, Rᵢ = result expression
```

TypeScript semantics are the *interleaving*:

```
S₁ R₁ S₂ R₂ … Sₙ Rₙ CONSUME(v₁ … vₙ)
```

but Luau forces all result expressions to be evaluated at the consumption
point:

```
S₁ S₂ … Sₙ CONSUME(R₁ … Rₙ)
```

That is: **each Rᵢ gets deferred past all later statement blocks Sⱼ (j > i)**.
The compiler's job is to decide, per operand, whether that deferral is
observable. If it is, the operand must be *materialized* at its original
sequence position:

```
Sᵢ ; local tempᵢ = Rᵢ   -- evaluate at the TS-mandated point
```

and `tempᵢ` used at the consumption point.

Two independent questions fall out of this:

* **Q1 (ordering):** does deferring `Rᵢ`'s evaluation past `Sᵢ₊₁ … Sₙ` change
  observable behavior? This is a *commutation* question between an expression
  and a block of statements.
* **Q2 (consumption):** does the consumer evaluate `Rᵢ` more than once, or
  after effects of its own (e.g. a macro that embeds the operand inside a
  loop)? This is a *stability* question about re-evaluating an expression
  across intervening effects.

The pre-redesign compiler answered both questions with blunt syntactic
approximations, in four inconsistent places:

| Site | Question | Old answer |
| --- | --- | --- |
| `ensureTransformOrder` | Q1 | if *any* later operand has prereqs, capture every earlier operand that isn't a literal/temp/const-identifier |
| `runCallMacro` | Q2 | capture **every** argument for which `expressionMightMutate` is true, *unconditionally*, because macro usage is opaque |
| `expressionMightMutate` | Q1+Q2 blurred | syntactic: "is this built only from literals/temps/const ids" |
| each macro body | Q2 | defensive `pushToVarIfComplex` / `pushToVarIfNonId` |

The result is both **over-capturing** (temps for `vec.add(other)`,
`m.set("a", g())`, `arr.push(g())`, `f(x, arr.pop())` — none of which need
one) and, in a few corners, **under-capturing** (loop macros re-read a
mutable identifier operand inside a loop that invokes a user callback, so
`arr.forEach((v, i, a) => …)` passes the *current* value of `arr` as `a`
instead of the value `arr` had at call time).

## 2. The model: effect summaries and commutation

Every Luau expression/statement the transformer produces is given a
conservative **effect summary**:

```ts
interface EffectSummary {
	readsLocals: ReadonlySet<string> | "all";  // reads of user-visible local/global bindings
	writesLocals: ReadonlySet<string> | "all"; // writes to user-visible bindings
	readsHeap: boolean;   // reads through a table/userdata (any property/index read)
	writesHeap: boolean;  // writes through a table/userdata
	throws: boolean;      // may raise a Luau error
	calls: boolean;       // may invoke unknown (user) code
}
```

`calls: true` is normalized to imply everything else ("all"/`true` across the
board): unknown code can read and write any binding captured by any closure
and any reachable table.

Key facts of Luau that the summary exploits:

* **Compiler temporaries are invisible.** A `TemporaryIdentifier` is a fresh
  name; declaring or assigning it cannot be observed by user code, and
  (by existing invariant, previously assumed by `expressionMightMutate`)
  temps are never reassigned after being exposed. Reads of temps are free;
  writes to temps are non-effects.
* **Heap writes cannot change local reads.** `table.insert(arr, v)` can never
  change what the *binding* `x` (or `arr`!) denotes. Only an assignment
  statement or a call into unknown code can do that.
* **`const` bindings can never change.** TS enforces this even across
  closures, so a read of a const binding is as good as a literal.
* **Getters/setters do not exist** (`noGetterSetter` diagnostic), so a
  property read never runs user code. It may still `error()` (e.g. Roblox
  `Instance` child access), hence `throws`.
* **Compiler-emitted global references** (`luau.globals.*` — `table`,
  `string`, `TS`, `game`, …) are singleton AST nodes and effectively const;
  they are recognized by node identity.

### 2.1 Expression summaries

| Expression | Summary |
| --- | --- |
| literals (`nil`, `true`, numbers, strings), `...`, `luau.None` | ∅ |
| `TemporaryIdentifier` | ∅ |
| `Identifier` marked const (see §2.4) or a `luau.globals` singleton | ∅ |
| other `Identifier` | `readsLocals: {name}` |
| `FunctionExpression` | ∅ (allocation only; the body runs later) |
| property access / computed index | base ∪ index ∪ `{readsHeap, throws}` |
| unary `#` | operand ∪ `{readsHeap}` |
| other unary / binary / `IfExpression` / parenthesized | union of children (TS bans metamethod-bearing operands for these operators) |
| array/set/map/mixed-table literals | union of members (fresh allocation is unobservable) |
| interpolated strings | union of parts ∪ `{readsHeap, throws}` (`__tostring` metamethods) |
| call of a **known builtin** (recognized by `luau.globals` node identity) | per-builtin table, e.g. ordinary `string.*` operations → `throws`, `table.create`/`typeof` → ∅⁺, `table.find`/`next` → `readsHeap`, `table.insert`/`remove`/`clear`/`move`/`setmetatable` → `readsHeap+writesHeap`, `string.gsub` / `table.sort` with comparator / `tostring` / `TS.*` → `calls`, `error`/`assert` → `throws` |
| any other call / method call | `calls` (= everything) |

⁺ builtin calls additionally union their argument summaries.

### 2.2 Statement summaries

Computed structurally; **function expression bodies are not entered** (their
effects happen when called, and any call site is already accounted for):

* `local <temp> = R` / `<temp> = R` → summary(R)
* `local <Identifier> = R` / `<Identifier> = R` / compound assignment →
  `writesLocals: {name}` ∪ summary(R) (declarations count as writes so that
  shadowing is conservatively safe)
* assignment through property/index → `writesHeap` ∪ parts
* call statements → call summary as above
* `if`/loops/`do` → union of all components and bodies
* `break`/`continue`/comments → ∅

### 2.3 Commutation

Deferring expression `R` (summary `a`) past statements `S` (summary `b`) is
safe iff the two **commute**:

```
disjoint(a.writesLocals, b.readsLocals)  ∧  disjoint(b.writesLocals, a.readsLocals)
∧ disjoint(a.writesLocals, b.writesLocals)
∧ ¬(a.writesHeap ∧ (b.readsHeap ∨ b.writesHeap))  ∧  ¬(b.writesHeap ∧ a.readsHeap)
∧ ¬(a.throws ∧ (b.throws ∨ b.writesAnything))     ∧  ¬(b.throws ∧ a.writesAnything)
```

The `throws` clauses preserve *error interleaving*: if the deferred read can
raise, no observable write (or other potential error) may be reordered ahead
of it — a `pcall`ing caller could otherwise observe effects that TypeScript
semantics say must not have happened yet (or see the wrong error). A
potentially-throwing read may still commute with **pure** statement blocks
(e.g. a `Map.size()` counting loop that only writes temps), because a read
that yields its value into thin air is unobservable when the block doesn't
write or throw.

This single predicate replaces both the "last operand with prereqs" heuristic
of `ensureTransformOrder` *and* the `expressionMightMutate` checks that call
transforms applied to the callee/base expression.

### 2.4 Const identifier tracking

`transformIdentifierDefined` knows the `ts.Symbol` for every identifier it
emits; when the symbol is not mutable (`isSymbolMutable` false: not a `let`,
not a parameter), the emitted `luau.Identifier` node is recorded in a
per-file `WeakSet` on `TransformState` (`markConstIdentifier` /
`isConstIdentifier`). Summaries consult this set, so const-ness is visible
even for identifiers nested deep inside composite expressions (where the old
code had no `ts.Node` to inspect and gave up). Callers that do have the
original `ts.Node` may still pass it as a refinement fallback.

### 2.5 Callee-aware summaries: analyzing known function bodies

A call is `calls` = ⊤ only when the callee is genuinely unknown. When an
identifier is an **immutable binding to a statically-known body** — a function
declaration, or a `const`-declared arrow/function expression —
`getFunctionSymbolSummary` (`util/summarizeFunctionSymbol.ts`) walks the
*TypeScript* body and produces the same kind of summary the Luau-side
analysis uses:

* parameters and locals declared inside the function compile to locals that
  are invisible at any call site — reads/writes of them are free;
* reads/writes of outer **mutable** bindings are recorded by name; when the
  binding is exported (emitted as an exports-table access,
  `isExportsTableBinding`) they are heap accesses instead;
* property/element accesses are heap reads/writes that may throw; calls
  recurse into the callee's own summary (recursion resolves as a least
  fixpoint, with results cached per `ts.Symbol` on `MultiTransformState`);
* anything not explicitly understood (`this`, `new`, `await`, iteration of a
  possibly-custom iterable, …) makes the whole body ⊤, as does exceeding a
  node budget. Async and generator functions are never analyzed.

`transformIdentifierDefined` tags the emitted identifier with the summary
(`tagCalleeSummary`, again a clone-surviving `Symbol` property), and
`summarizeCall` uses the tag where it previously gave up. The effect is that
calls to provably-tame helpers stop forcing temporaries: `f(fib(n), arr.pop())`
keeps `fib(n)` inline, `m.set("k", pureFn())` no longer captures a `let`
receiver, and `arr.map(double)` with a known-pure `double` leaves the
receiver raw. Helpers that *do* write a binding or the heap still order
exactly as before — their summaries say so precisely instead of via ⊤.

Value stability is deliberately *not* inferred: an effect-free call may still
return a fresh table per evaluation, so `isRepeatable` treats any expression
containing a call (like any containing a table/closure constructor) as
non-repeatable — effect purity licenses dropping or deferring a single
evaluation, never re-evaluation.

Like `markConstIdentifier`, the analysis leans on roblox-ts's existing
const-ness model (`isSymbolMutable`), which treats function-declaration
bindings as never reassigned.

**Inline callbacks** get the same treatment: `transformFunctionExpression`
summarizes the body of every non-async, non-generator arrow/function literal
and tags the emitted `luau.FunctionExpression`; `pushToVar` propagates the tag
onto the capture temporary, since the temp holds the same function value. So
`arr.filter(v => v > 1)` — where the literal must be captured into `_arg0`
for the loop — still summarizes the loop body precisely, and neighboring
operands stop paying for an "unknown code" callback.

### 2.6 Fresh allocations: writes that alias nothing

Temporaries are single-assignment and unnameable by user code. When a
summarized statement list declares a temp from a table constructor or
`table.create`/`table.pack` (never `table.clone`, which copies the source's
metatable), that temp holds a **fresh, metatable-less table** — until the
block's result escapes, nothing user-visible can reach it. Direct writes into
it (`_newValue[_k] = v`, and `table.insert`/`table.move` whose mutation target
it is) therefore alias nothing an operand could observe and run no
metamethods: they are non-effects, minus a possible error when a computed
key/position is not a compiler-controlled numeric (a temp counter, literal,
`#x`, or arithmetic over such — macro-emitted keys always are).

Freshness is keyed by the temp's numeric `id` (clones made at macro build
time share it; a `Symbol` tag applied at summarize time would miss them) and
is permanent, since the allocation's freshness never changes. This turns the
output-building loops of `map`/`filter`/spread from heap-writers into mere
heap-*readers*, so `use(obj.x, arr.map(double))` no longer captures `obj.x`.
The compiler never emits `setmetatable` onto such temps (verified: the only
temp-directed `setmetatable` calls pass `nil`, which removes metatables), so
reads/writes cannot invoke user `__index`/`__newindex`.

### 2.7 Heap regions, type-refined errors, and tame engine calls

The heap is split into two disjoint regions tracked as a bitmask: **Lua
tables** and **Roblox engine state** (Instances and mutable userdata). Every
mutation the compiler itself emits is a table mutation, and engine APIs never
mutate Lua tables reachable from their arguments (the reflection layer
marshals tables into C++ containers by copy), so the regions cannot alias:
`commutes` intersects region masks instead of a single boolean.

Region and error classification come from TS types:

* **Member reads** (`t.x`, `t[i]`): with an aligned source node, the base's
  type decides. An immutable Roblox data type (`Vector3`, `CFrame`, … — a
  fixed allowlist that excludes mutable ones like `Random`/`RaycastParams`)
  → pure. An Instance → engine-state read that may throw (typed child
  accesses are real lookups). A definitely-non-nil, non-Roblox, non-callable
  object → a table read that **cannot throw** — plain table indexing never
  errors, and roblox-ts class metatables resolve `__index` through table
  chains. (A hand-installed erroring `__index` function is the same class of
  type-system lie as the existing "member reads never run user code"
  assumption.) Anything else stays "any region, may throw".
* **Operand value tags**: macro-emitted accesses (`arr[_length] = nil`,
  `#arr`) have no source nodes, so the drivers tag each operand node with the
  heap region of the *value it holds*, from its TS type. The tag survives
  clones and is propagated to capture temporaries by `pushToVar`; member
  accesses fall back to the base's tag. This is what makes `pop`'s prereqs
  table-region (and its reads non-throwing), so
  `use(part.GetMass(), arr.pop())` keeps the engine read inline.
* **Tame engine calls**: methods (and statics/constructors) of immutable
  data types are pure value computations; a fixed allowlist of read-only,
  non-yielding Instance methods (`GetChildren`, `FindFirstChild`, `IsA`,
  `GetAttribute`, …) summarize as engine-state reads. Everything else —
  anything that can mutate engine state, dispatch user handlers
  (`BindableFunction:Invoke`), or *yield* (`WaitForChild`), during which
  other user threads may mutate anything — remains unknown code.
* **Value stability**: a callee whose TS signature definitely returns a
  primitive is tagged; a *pure* call to it is repeatable (primitives have no
  allocation identity), so such calls survive not-exactly-once contexts
  without a temporary. Table-returning calls still always capture.

Error interleaving still rules: `use(part.Position, arr.pop())` keeps its
temp, because both the Instance read and the (possibly frozen-table) write
can throw and a `pcall`ing caller must observe the right error.

**Register reads are lazy.** Luau locals are registers, and an instruction
reads its register operands when it *executes* — not when the operand appears.
In `v1 + (swap())`, the `ADD` reads `v1`'s register after `swap()` has run, so
a right side that reassigns the left local is observed, violating TS order.
This applies to arithmetic/comparison operands and computed-index bases
(`GETTABLE`), including Luau's own compound assignments (`x *= f()`). It does
**not** apply to call/method arguments, table constructor fields, or `..`
chains (each operand is discharged into a register at its own position), nor
to `and`/`or` (the left register is tested before the right side runs).
Three places encode this: `beforeSummaryInExpression` extends an identifier
operand's "before" with its sibling operands when it sits in a lazily-read
position; `transformBinaryExpression` materializes a left-identifier operand
that does not commute with the right side; and compound assignments fall back
from Luau's compound operator to the split
`local _readable = x; x = _readable * f()` form under the same test
(`compoundReadNeedsMaterializing`).

**Locals and the copy boundary.** Engine APIs cannot read or write Luau
locals directly — arguments are marshaled by copy — and the refined
summaries above already say so (empty `readsLocals`/`writesLocals`). But two
argument kinds are *references*, not copies: function values (callbacks are
invoked, and closures write their upvalues) and Instances. And engine-state
*mutations* fire the `Changed`/`GetPropertyChangedSignal` family, whose
handlers run synchronously under `SignalBehavior.Immediate` — ordinary user
closures that can read or write anything. Hence the asymmetry: engine-state
*reads* are tame (no signals, no callbacks, no yields for the allowlist),
while an Instance member *write* — or a write through a base that cannot be
proven a plain table — is treated as unknown code. `transformWritableExpression`
tags every member-assignment base with its region so table writes keep their
precise summary.

## 3. Q1 rewritten: `ensureTransformOrder`

The signature is unchanged. The implementation becomes:

```
infos = operands.map(capture(transform))
suffix = ∅                                    (computed right-to-left)
for i from n-1 down to 0:
	capture[i] = !commutes(summary(Rᵢ), suffix)
	if capture[i]: suffix ∪= summary(Rᵢ)
	suffix ∪= summary(Sᵢ)
for each i (left-to-right):
	emit Sᵢ
	Rᵢ' = capture[i] ? pushToVar(Rᵢ) : Rᵢ
```

`suffix` is everything after operand `i` that will run before a *raw* operand
`i`'s deferred consumption: later operands' prereq statements, **plus the
evaluation of any later operand that is itself captured** — its `pushToVar`
assignment executes at its original position. (A raw later operand contributes
nothing: it stays at the consumption point, after operand `i`, matching TS
order.) The second term is what forces the right-to-left pass — whether `j`
is captured must be known before `i < j` can be decided, and each new capture
can cascade further left. Omitting it is unsound: in `[n, bumpN(), arr.pop()]`
where `bumpN` writes `n`, `bumpN()` is captured (it must precede pop's
prereqs), which hoists the write above the raw read of `n`.

This decision procedure is `decideOrderedCaptures` in `util/effects.ts`,
shared by `ensureTransformOrder` and `runCallMacro`'s operand sequencing
(where an operand may contribute several result expressions, e.g. an unpacked
spread).

Notable behavioral deltas (all verified against runtime semantics):

* `f(x, arr.pop())` — `x` reads a local; pop's prereqs only write heap →
  **no temp** (previously captured).
* `f(m.get("a"), m.size())` — `m.a` is a heap read (may throw), but the size
  loop writes only temps and cannot throw → **no temp** (previously captured).
* `f(x, (x = g()))` — the assignment prereq writes local `x` → temp, exactly
  as before. Per-name granularity means `f(y, (x = 1))` no longer captures `y`.
* `f(a.b, g())` where `g`'s lowering contains a real call → heap read vs.
  `calls` → temp, as before.

## 4. Q2 rewritten: the macro contract

### 4.1 What was wrong

`runCallMacro` materialized every "might mutate" argument up front because it
could not know how the macro would use it — even though the overwhelming
majority of macros embed each operand **exactly once, at its natural position**
(math macros, `string.*` wrappers, `get`/`set`/`has`/`delete`/`insert`/
`remove`/`includes`/`indexOf`/`push`/…). Meanwhile the macros *also*
defensively captured, using predicates (`isSimple`, `isAnyIdentifier`) that
ignore both const-ness and what the macro itself does between uses — too
strong and too weak at once.

### 4.2 The new contract: driver observes what the macro actually does

Macros are plain functions again — no effect-class annotation, no ordering
helpers in their bodies. They embed the object expression and each argument
wherever the emitted Luau needs them. `runCallMacro` (in
`transformCallExpression.ts`) discovers the required captures by **running the
macro and inspecting its output**:

1. **Q1 (ordering):** transform `[self, arg₁ … argₙ]` as an ordered operand
   sequence with the commutation rule of §3, capturing an operand's result
   expression when it does not commute with the later operands' prereq
   statements.
2. **Q2 (usage analysis):** *trial-run* the macro with the (raw) operands, in
   a captured + diagnostic-suppressed context that is then discarded, and hand
   the trial's `prereqs` + `result` to `computeMacroCaptures`. It decides,
   per operand, whether leaving it raw is observably identical to evaluating
   it once at its canonical up-front position. Operands that need it are
   captured into temporaries; then the macro is run **for real** with the
   final operand list.

`computeMacroCaptures` (in `util/effects.ts`) captures operand `i` when any of:

* **it is unused and impure** — a dropped operand still has to run for its
  effects, so it is hoisted; a dropped *pure* operand is simply omitted;
* **it is evaluated more than once, or inside a loop/closure body**, and is
  not freely *repeatable* — only a pure read of a local/global binding is
  repeatable (a heap read may be aliased by a write; a table/closure literal
  allocates a fresh object each time; anything throwing/writing/calling is
  out), and even then only if its value commutes with everything the macro
  does around the uses;
* **it is used exactly once**, but its evaluation does not commute with
  everything the macro evaluates *before* that occurrence — which is exactly
  what must be unobservable for its single in-place evaluation to equal the
  canonical up-front one. Effects that run *after* the operand (the macro's
  own trailing call/store) never force a capture, so e.g. the receiver of
  `s.find(pat)` stays inline ahead of the throwing `string.find` call.

Conflicts between a canonically-earlier operand `j` and a later one `i` are
caught when analyzing `j` (whose "before" can include `i`), so `i` need not
re-examine earlier operands. Const-ness flows through for free: a `const`
binding summarizes as pure, so it survives even re-evaluation across user
callbacks — better than the hand-tuned macros, which captured it defensively.

A final right-to-left pass mirrors §3's rule at this layer: a capture
evaluates its operand at the shared up-front position — before every raw
operand's embedded occurrence, *including raw operands to its left*, which TS
says must evaluate first. Any raw operand that does not commute with the
captured operands after it is force-captured (each new capture can cascade
further left).

**Two implementation hazards, both handled centrally:**

* *Node cloning.* `luau.create` shallow-clones any node that is reused within
  a tree, so identity is not stable for a reused operand or a shared global
  singleton. The analysis tags operands and the builtin `luau.globals` with
  `Symbol` properties, which survive the shallow clone; occurrences and
  builtin calls are matched by tag, not identity. Operands are tagged *before*
  the trial run so the macro's clones inherit the tag.
* *Assignment store order.* In an emitted `base[k] = v` where `base` is a
  plain local, Luau reads the base binding at store time — after `k` and `v`
  (verified empirically). The "before" analysis treats an assignment's parts
  conservatively (any part may precede the target), so `Map.set`/`Set.add`/
  `delete` capture the base exactly when a later operand could rebind it.
  Plain TypeScript assignments (`obj.a = f()`) carry the same latent hazard
  and are unchanged here.

Within a transform, `pushToVarIfComplex`/`pushToVar` may still appear — but
only to avoid *recomputing* a non-trivial operand-derived expression used
several times (e.g. `unorderedRemove`'s `index + 1`). That is a code-size
choice, never a correctness requirement.

### 4.3 Effect on emitted code

| Source | Before | After |
| --- | --- | --- |
| `vec.add(other)` (`let other`) | `local _other = other` ↵ `vec + _other` | `vec + other` |
| `s.sub(1, x)` (`let x`) | `local _x = x` ↵ `string.sub(s, 1, _x)` | `string.sub(s, 1, x)` |
| `arr.push(g())` (statement) | `local _arg0 = g()` ↵ `table.insert(arr, _arg0)` | `table.insert(arr, g())` |
| `arr.pop()` (`arr` local) | `local _exp = arr` ↵ … | `arr` inline (re-reading a local is free) |
| `const arr; arr.reduce(cb, 0)` | `local _exp = arr` ↵ loop | `arr` inline (const can't be rebound) |
| `arr.forEach(cb)` (`let arr`) | loop reads `arr` per-iteration (wrong if `cb` reassigns `arr`) | `local _exp = arr` — correct |
| `map.set("k", evil())` (`evil` rebinds `map`) | wrote to the *new* map | base captured — writes to the original |

The last three rows are the correctness fixes; the rest are temp reductions
that, in aggregate over the test corpus, land slightly *below* the previous
hand-tuned macros while depending on none of their per-macro knowledge.

The `▼/▲` banner-comment wrapping is unchanged (it operates on whatever
prereqs a macro produces); operand captures are emitted by the driver outside
that wrapper.

## 5. `expressionMightMutate` retired

Its callers asked subtly different questions and now use the precise tool:

* **call transforms** (base/callee capture): Q1 → `commutes(summary(base), summary(argPrereqs))`.
* **decorators / enum inlining**: "can evaluation be deferred past arbitrary
  later statements?" → `isInvariant(state, expr, node)`, defined as
  summary = ∅ (no reads, no heap, no calls, no throws). This matches the old
  semantics but sees through const identifiers nested in composites.

## 6. What deliberately did *not* change

* The prereq mechanism itself (`state.capture`, the statement stack) — it is
  the right substrate; only the *decisions* layered on it were replaced.
* Macro signature `(state, node, expression, args) => luau.Expression` — the
  redesign moves knowledge, not plumbing. Macros carry no annotations at all;
  the driver derives everything from their output. The one cost is that each
  macro runs twice per call site (a discarded trial plus the real run), which
  is negligible against type-checking.
* `transformOptionalChain`'s temp management (its temps are required for
  control flow, not ordering).
* Aliasing granularity: the heap is a single region. Distinguishing disjoint
  tables (e.g. via provably-distinct fresh allocations) is a possible future
  refinement; the summary structure already has room for it.
* `argumentsWithDefaults` still unconditionally captures potentially-`nil`
  arguments — the temp is also the assignment target for the default value.

## 7. Safety argument

For Q1: an operand is left inline only if its summary commutes with the union
of all later prereq summaries. Summaries are conservative upper bounds on
behavior (any unrecognized call is `calls` = ⊤), and commutation as defined
in §2.3 implies the interleaved TS schedule and the hoisted Luau schedule are
observably equivalent — including which error fires first, via the `throws`
clauses.

For Q2: `computeMacroCaptures` leaves an operand inline only when its actual
usage in the emitted output is provably equivalent to a single canonical
evaluation — used once and commuting with everything before it, or repeated
but freely repeatable and stable across the macro's effects, or unused and
pure. Summaries are conservative upper bounds, occurrence tracking survives
node cloning via tags, and any doubt resolves to a capture. The result is
never an unsafe inline; the worst case is a redundant temporary.

The runtime test suite (`tests/src/tests/*.spec.ts`, executed under Lune)
exercises the observable semantics; `evaluationOrder.spec.ts` pins the
argument/receiver mutation orderings — including callbacks that reassign the
receiver binding — that this analysis must get right.

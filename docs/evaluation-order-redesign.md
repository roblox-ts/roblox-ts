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
| call of a **known builtin** (recognized by `luau.globals` node identity) | per-builtin table, e.g. `string.*`/`table.create`/`typeof` → ∅⁺, `table.find`/`next` → `readsHeap`, `table.insert`/`remove`/`clear`/`move`/`setmetatable` → `readsHeap+writesHeap`, `table.sort` with comparator / `tostring` / `TS.*` → `calls`, `error`/`assert` → `throws` |
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

## 3. Q1 rewritten: `ensureTransformOrder`

The signature is unchanged. The implementation becomes:

```
infos     = operands.map(capture(transform))
suffix[i] = Σ summary(Sⱼ) for j > i          (computed right-to-left)
for each i:
	emit Sᵢ
	Rᵢ' = commutes(summary(Rᵢ), suffix[i]) ? Rᵢ : pushToVar(Rᵢ)
```

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

### 4.2 The new contract

`runCallMacro` now only solves **Q1**: it transforms `[self, arg₁ … argₙ]`
as an ordered operand sequence with the commutation rule of §3 (the macro's
own effects all happen at the consumption point, after every operand, so they
impose no additional Q1 constraints). Arguments arrive at the macro
*unmaterialized* whenever ordering allows.

**Macro authors' obligations** (documented on the `PropertyCallMacro` type):
every received expression (`expression`, `args[i]`) must be either

1. **embedded exactly once**, positioned so it evaluates at the macro's
   consumption point *before* any effectful statement the macro emits — i.e.
   used inside the first effectful prereq or in a pure result expression; or
2. **stabilized first** via the new Q2 helpers:

```ts
stabilizeOperands(state, [
	{ expression, across, multiUse?, capture?, name? },
	…
]) // operands listed in TS evaluation order; returns the expressions to use
ensureReusable(state, expr, across, name?) // single-operand shorthand
// across: "none"       — ordering/multiplicity constraints only
//         "heapWrites" — macro re-evaluates expr across its own table writes
//         "userCode"   — macro re-evaluates expr across calls into user code
//                        (loop bodies invoking callbacks) or returns it after them
```

`stabilizeOperands` emits `local temp = <operand>` declarations in operand
order exactly where required. An operand is captured when re-evaluation
across its declared effect class would be observable, when it is `multiUse`
and non-trivial to recompute, or when leaving it raw would defer its
evaluation past a *later listed operand* it does not commute with (raw
operands evaluate wherever the macro embeds them, after all capture
declarations). Even operands the macro uses only once must be *listed* if an
earlier operand is stabilized, so ordering between them is accounted for.

Stability, per effect class:

* `across: "heapWrites"` — allowed to read locals but not the heap
  (identifiers, literals, temps, arithmetic thereon). Heap reads must be
  captured: writing `m[k] = nil` can change what a second evaluation of an
  aliasing `a.b` yields (or even make it `nil` and turn the second use into
  an error).
* `across: "userCode"` — only ∅-summary expressions survive (literals, temps,
  **const** identifiers). A mutable identifier must be captured because the
  callback can reassign it — this fixes the `forEach` third-argument hole
  described in §1. Allocation expressions (function/table literals) are also
  captured: re-evaluating them would create fresh objects.

This is the same *shape* as the old `pushToVarIfComplex`/`pushToVarIfNonId`
calls (a one-line prelude in each macro), so macro bodies stay familiar —
but the decision is now semantic rather than syntactic, and the driver no
longer duplicates it pessimistically.

**Luau assignment-statement caveat:** in an emitted `base[k] = v` where
`base` is a plain local, Luau reads the base *binding* at store time — after
`k` and `v` have evaluated (verified empirically; the reference manual calls
the order unspecified). TypeScript evaluates the object first, so a macro
statement path that lowers to an assignment must still run its operands
through `stabilizeOperands` (with `across: "none"`) even when each operand is
used exactly once: the base gets captured into a temporary — which nothing
can reassign — exactly when a later operand's effects could rebind it
(`Map.set`/`Set.add`/`delete`). Plain TypeScript assignments (`obj.a = f()`
via `transformWritableAssignment`) carry the same latent hazard; that
behavior predates this redesign and is unchanged here.

### 4.3 Effect on emitted code

| Source | Before | After |
| --- | --- | --- |
| `vec.add(other)` (`let other`) | `local _other = other` ↵ `vec + _other` | `vec + other` |
| `m.set("a", g())` | `local _arg1 = g()` ↵ `m.a = _arg1` | `m.a = g()` |
| `arr.push(g())` (statement) | `local _arg0 = g()` ↵ `table.insert(arr, _arg0)` | `table.insert(arr, g())` |
| `f(x, arr.pop())` | `local _exp = x` before the pop block | `x` inline |
| `a2.unorderedRemove((i *= 2))` | `i *= 2` ↵ `local _i = i` ↵ `local _index = _i + 1` … | `i *= 2` ↵ `local _index = i + 1` … |
| `arr.forEach(cb)` (`let arr`) | loop reads `arr` per-iteration (wrong if `cb` reassigns `arr`) | `local _exp = arr` — correct |

The `▼/▲` banner-comment wrapping is unchanged (it operates on whatever
prereqs a macro produces).

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
  redesign moves knowledge, not plumbing; `ensureReusable` is the only new
  vocabulary a macro author needs.
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

For Q2: a macro either uses an operand once at the consumption point (which
Q1 already validated) or declares the effect class it re-evaluates across;
`ensureReusable` only leaves expressions inline when re-evaluation across
that class is unobservable (∅-summary for user code; local-only reads across
pure heap writes).

The runtime test suite (`tests/src/tests/*.spec.ts`, executed under Lune)
exercises the observable semantics; new specs were added for the argument/
self mutation orderings that motivated the redesign.

import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { skipDownwards } from "TSTransformer/util/traversal";
import {
	isAnyType,
	isDefinitelyType,
	isImmutableRobloxDataType,
	isImmutableRobloxDataTypeConstructor,
	isInstanceType,
	isObjectType,
	isPossiblyType,
	isRobloxType,
	isUndefinedType,
} from "TSTransformer/util/types";
import ts from "typescript";

/**
 * The heap is split into two disjoint regions, tracked as a bitmask: Lua tables (which is
 * where every compiler-emitted mutation lands) and Roblox engine state (Instances and
 * mutable userdata). Engine APIs never mutate Lua tables reachable from their arguments —
 * the reflection layer marshals tables into C++ containers by copy — so reads/writes of
 * the two regions cannot alias each other.
 */
export type HeapRegions = number;
export const HEAP_NONE: HeapRegions = 0;
export const HEAP_TABLES: HeapRegions = 1 << 0;
export const HEAP_INSTANCES: HeapRegions = 1 << 1;
export const HEAP_ALL: HeapRegions = HEAP_TABLES | HEAP_INSTANCES;

/**
 * A conservative summary of the observable behavior of a piece of generated Luau.
 *
 * Used to decide whether evaluation of an expression can be deferred past a block of
 * statements or repeated (see `commutes` and `computeMacroCaptures`) without changing
 * the program's observable behavior relative to TypeScript's evaluation order.
 *
 * Compiler-generated temporaries are invisible to user code: reads of them are free and
 * writes to them are non-effects. This relies on the existing invariant that temporary
 * identifiers are never reassigned after being exposed from a transform.
 */
export interface EffectSummary {
	/** Names of user-visible bindings (locals/globals) that may be read. */
	readonly readsLocals: ReadonlySet<string> | "all";
	/** Names of user-visible bindings that may be written (or shadowed by a new declaration). */
	readonly writesLocals: ReadonlySet<string> | "all";
	/** Heap regions that may be read through a reference. */
	readonly readsHeap: HeapRegions;
	/** Heap regions that may be written through a reference. */
	readonly writesHeap: HeapRegions;
	/** May raise a Luau error. */
	readonly throws: boolean;
	/** May invoke unknown (user) code. Normalized: implies every other field. */
	readonly calls: boolean;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

// `luau.create` clones any node that already has a parent (shallow spread), so identity is
// not stable for nodes reused across an emitted tree — but Symbol-keyed properties survive
// the spread. We tag nodes we need to recognize after they have been placed and possibly
// cloned: operands (per capture-analysis) and the compiler's own builtin globals.
type TaggedNode = luau.Expression & {
	[OPERAND_TAG]?: number;
	[BUILTIN_CALL_TAG]?: EffectSummary;
	[BUILTIN_GLOBAL_TAG]?: true;
	[CALLEE_SUMMARY_TAG]?: EffectSummary;
	[RETURNS_PRIMITIVE_TAG]?: true;
	[BUILTIN_FRESH_TAG]?: true;
	[VALUE_REGION_TAG]?: HeapRegions;
};
const OPERAND_TAG = Symbol("operandTag");
const BUILTIN_CALL_TAG = Symbol("builtinCallSummary");
const BUILTIN_GLOBAL_TAG = Symbol("builtinGlobal");
const CALLEE_SUMMARY_TAG = Symbol("calleeSummary");
// callee definitely returns a primitive (string/number/boolean/nil) per its TS signature —
// primitive results have no allocation identity, so pure calls to it are value-stable
const RETURNS_PRIMITIVE_TAG = Symbol("calleeReturnsPrimitive");
// the heap region of the value an operand node holds, from its TS type (see tagValueRegion);
// refines member accesses through the node inside macro-emitted code, where no source node
// is available
const VALUE_REGION_TAG = Symbol("valueRegion");
// marks builtins whose call returns a fresh, metatable-less table (table.create/table.pack;
// NOT table.clone, which copies the source's metatable)
const BUILTIN_FRESH_TAG = Symbol("builtinReturnsFreshTable");
/**
 * `id`s of temporaries that some summarized statement list declared as a fresh,
 * metatable-less table (a table constructor or table.create/pack call). Temporaries are
 * single-assignment and unnameable by user code, so until the block's result escapes,
 * direct writes into such a table are invisible to every operand — they alias nothing
 * user-visible and (metatables being absent) run no user code. Membership is permanent:
 * freshness of the allocation never changes. Keyed by the numeric `id` rather than a node
 * tag because macros clone a temp's node at *build* time, before any summarization could
 * tag it — the `id` is the identity that survives `luau.create`'s shallow clone.
 */
const freshTempIds = new Set<number>();

/**
 * Drops analysis state that only made sense within one compilation step. Temporary `id`s
 * are process-globally unique (the counter never resets), so stale `freshTempIds` entries
 * can never misclassify a later compile's temps — clearing just keeps watch-mode memory
 * flat. Called when a new `MultiTransformState` is created.
 */
export function clearTransientAnalysisState() {
	freshTempIds.clear();
	maskedOperandTags = undefined;
}

/**
 * Records on an emitted callee expression the effect summary of the function body it is
 * statically known to refer to (an immutable binding whose body was analyzed — see
 * `getFunctionSymbolInfo`). `summarizeCall` then uses the body's summary instead of
 * treating the call as unknown code. The tag survives `luau.create`'s clones.
 */
export function tagCalleeSummary(expression: luau.Expression, summary: EffectSummary, returnsPrimitive = false) {
	(expression as TaggedNode)[CALLEE_SUMMARY_TAG] = summary;
	if (returnsPrimitive) {
		(expression as TaggedNode)[RETURNS_PRIMITIVE_TAG] = true;
	}
}

/**
 * Propagates callee tags from `from` onto `to`. Used when an expression is captured into a
 * temporary (`pushToVar`): the temp holds the same function value, so calls through the
 * temp have the same effects. Reads through parentheses.
 */
export function copyCalleeSummary(from: luau.Expression, to: luau.Expression) {
	while (luau.isParenthesizedExpression(from)) {
		from = from.expression;
	}
	const summary = (from as TaggedNode)[CALLEE_SUMMARY_TAG];
	if (summary !== undefined) {
		(to as TaggedNode)[CALLEE_SUMMARY_TAG] = summary;
	}
	if ((from as TaggedNode)[RETURNS_PRIMITIVE_TAG]) {
		(to as TaggedNode)[RETURNS_PRIMITIVE_TAG] = true;
	}
	const region = (from as TaggedNode)[VALUE_REGION_TAG];
	if (region !== undefined) {
		(to as TaggedNode)[VALUE_REGION_TAG] = region;
	}
}

/**
 * While set, `summarizeExpression` returns `PURE_SUMMARY` for any operand whose tag is in
 * this set. Used by `computeMacroCaptures` to summarize a macro's output while excluding
 * the operands (and their clones) whose effects are accounted for separately.
 */
let maskedOperandTags: ReadonlySet<number> | undefined;

export const PURE_SUMMARY: EffectSummary = {
	readsLocals: EMPTY_SET,
	writesLocals: EMPTY_SET,
	readsHeap: HEAP_NONE,
	writesHeap: HEAP_NONE,
	throws: false,
	calls: false,
};

export const CALLS_UNKNOWN_SUMMARY: EffectSummary = {
	readsLocals: "all",
	writesLocals: "all",
	readsHeap: HEAP_ALL,
	writesHeap: HEAP_ALL,
	throws: true,
	calls: true,
};

function unionNames(a: ReadonlySet<string> | "all", b: ReadonlySet<string> | "all"): ReadonlySet<string> | "all" {
	if (a === "all" || b === "all") return "all";
	if (a.size === 0) return b;
	if (b.size === 0) return a;
	const result = new Set(a);
	for (const name of b) result.add(name);
	return result;
}

function namesIntersect(a: ReadonlySet<string> | "all", b: ReadonlySet<string> | "all"): boolean {
	if (a === "all") return b === "all" || (b as ReadonlySet<string>).size > 0;
	if (b === "all") return a.size > 0;
	const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
	for (const name of smaller) {
		if (larger.has(name)) return true;
	}
	return false;
}

export function unionSummaries(a: EffectSummary, b: EffectSummary): EffectSummary {
	if (a === PURE_SUMMARY) return b;
	if (b === PURE_SUMMARY) return a;
	if (a.calls) return CALLS_UNKNOWN_SUMMARY;
	if (b.calls) return CALLS_UNKNOWN_SUMMARY;
	return {
		readsLocals: unionNames(a.readsLocals, b.readsLocals),
		writesLocals: unionNames(a.writesLocals, b.writesLocals),
		readsHeap: a.readsHeap | b.readsHeap,
		writesHeap: a.writesHeap | b.writesHeap,
		throws: a.throws || b.throws,
		calls: false,
	};
}

function writesAnything(summary: EffectSummary): boolean {
	return summary.writesHeap !== HEAP_NONE || summary.writesLocals === "all" || summary.writesLocals.size > 0;
}

/**
 * Returns true if evaluating `a` and `b` in either order is observably equivalent.
 *
 * The `throws` clauses preserve error interleaving: a potentially-throwing computation
 * may not be reordered relative to observable writes or other potential errors, since a
 * `pcall`ing caller could otherwise observe effects that TypeScript's evaluation order
 * says must not have happened yet (or observe the wrong error).
 */
export function commutes(a: EffectSummary, b: EffectSummary): boolean {
	if (namesIntersect(a.writesLocals, b.readsLocals)) return false;
	if (namesIntersect(b.writesLocals, a.readsLocals)) return false;
	if (namesIntersect(a.writesLocals, b.writesLocals)) return false;
	if ((a.writesHeap & (b.readsHeap | b.writesHeap)) !== HEAP_NONE) return false;
	if ((b.writesHeap & a.readsHeap) !== HEAP_NONE) return false;
	if (a.throws && (b.throws || writesAnything(b))) return false;
	if (b.throws && writesAnything(a)) return false;
	return true;
}

/**
 * Effect summaries for calls to builtins the compiler itself emits, recognized against the
 * `luau.globals` singletons (immune to user-code name shadowing). Recognition is by a tag
 * on the callee node (which survives cloning) with a Map fallback for the pristine
 * singletons. Argument summaries are unioned in by the caller. Anything not listed here is
 * treated as a call into unknown code.
 */
const BUILTIN_CALL_SUMMARIES = new Map<luau.Expression, EffectSummary>();
// the builtins the compiler emits all operate on Lua tables, never on engine state
export const READS_TABLES_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: HEAP_TABLES };
const READS_HEAP_SUMMARY = READS_TABLES_SUMMARY;
const READS_HEAP_THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: HEAP_TABLES, throws: true };
const MUTATES_HEAP_SUMMARY: EffectSummary = {
	...PURE_SUMMARY,
	readsHeap: HEAP_TABLES,
	writesHeap: HEAP_TABLES,
	throws: true,
};
export const THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, throws: true };
// unrefined member accesses: without type information the base may be a table or an Instance
export const READS_ALL_THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: HEAP_ALL, throws: true };
const READS_INSTANCES_THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: HEAP_INSTANCES, throws: true };
const READS_INSTANCES_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: HEAP_INSTANCES };
// sentinel: table.sort invokes a user comparator only when one is passed (see summarizeCall)
const SORT_BUILTIN: EffectSummary = { ...PURE_SUMMARY };
// sentinels: table.insert/move mutate a specific argument, which may be a fresh temp
const INSERT_BUILTIN: EffectSummary = { ...PURE_SUMMARY };
const MOVE_BUILTIN: EffectSummary = { ...PURE_SUMMARY };

function setBuiltinCall(callee: luau.Expression, summary: EffectSummary) {
	BUILTIN_CALL_SUMMARIES.set(callee, summary);
	(callee as TaggedNode)[BUILTIN_CALL_TAG] = summary;
}
{
	for (const name of [
		"byte",
		"find",
		"format",
		"gmatch",
		"lower",
		"match",
		"rep",
		"reverse",
		"split",
		"sub",
		"upper",
	] as const) {
		// string operations can error on bad input; strings are immutable so no heap access
		setBuiltinCall(luau.globals.string[name], THROWS_SUMMARY);
	}
	// gsub accepts callback and table replacements. A callback can run arbitrary user code,
	// while a table replacement reads user-visible heap state, so neither overload can be
	// safely represented by the ordinary string-operation summary.
	setBuiltinCall(luau.globals.string.gsub, CALLS_UNKNOWN_SUMMARY);
	setBuiltinCall(luau.globals.table.create, PURE_SUMMARY);
	(luau.globals.table.create as TaggedNode)[BUILTIN_FRESH_TAG] = true;
	(luau.globals.table.pack as TaggedNode)[BUILTIN_FRESH_TAG] = true;
	setBuiltinCall(luau.globals.table.find, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.concat, READS_HEAP_THROWS_SUMMARY);
	setBuiltinCall(luau.globals.table.isfrozen, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.maxn, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.clone, READS_HEAP_THROWS_SUMMARY);
	setBuiltinCall(luau.globals.table.pack, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.unpack, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.insert, INSERT_BUILTIN);
	setBuiltinCall(luau.globals.table.remove, MUTATES_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.move, MOVE_BUILTIN);
	setBuiltinCall(luau.globals.table.clear, MUTATES_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.freeze, MUTATES_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.sort, SORT_BUILTIN);
	setBuiltinCall(luau.globals.math.min, PURE_SUMMARY);
	setBuiltinCall(luau.globals.next, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.select, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.type, PURE_SUMMARY);
	setBuiltinCall(luau.globals.typeof, PURE_SUMMARY);
	setBuiltinCall(luau.globals.getmetatable, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.setmetatable, MUTATES_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.error, THROWS_SUMMARY);
	setBuiltinCall(luau.globals.assert, THROWS_SUMMARY);
	setBuiltinCall(luau.globals.unpack, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.ipairs, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.pairs, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.utf8.codes, READS_HEAP_SUMMARY);
	// NOT listed (treated as unknown code): tostring (__tostring metamethods), pcall,
	// require, coroutine.yield, TS.* runtime library functions
}

/**
 * Identifier singletons from `luau.globals` (including the bases of its property accesses,
 * e.g. the `table` in `table.insert`). The compiler only emits these nodes to reference
 * true Luau/Roblox globals, which user code compiled by roblox-ts can never reassign, so
 * reads of them are free. Tagged as well as collected, so clones are still recognized.
 */
const BUILTIN_GLOBAL_IDS = new Set<luau.Identifier>();
{
	const visit = (value: unknown) => {
		if (luau.isNode(value as luau.Node)) {
			const node = value as luau.Node;
			if (luau.isIdentifier(node)) {
				BUILTIN_GLOBAL_IDS.add(node);
				(node as TaggedNode)[BUILTIN_GLOBAL_TAG] = true;
			} else if (luau.isPropertyAccessExpression(node) && luau.isIdentifier(node.expression)) {
				BUILTIN_GLOBAL_IDS.add(node.expression);
				(node.expression as TaggedNode)[BUILTIN_GLOBAL_TAG] = true;
			}
		} else if (typeof value === "object" && value !== null) {
			for (const inner of Object.values(value)) visit(inner);
		}
	};
	visit(luau.globals);
}

function readsLocal(name: string): EffectSummary {
	return { ...PURE_SUMMARY, readsLocals: new Set([name]) };
}

/**
 * Interpolated strings whose interpolated values are all known to be primitives
 * (string/number/boolean/nil), so that formatting them cannot invoke a `__tostring`
 * metamethod (and therefore cannot run user code or error).
 */
const PRIMITIVE_INTERPOLATED_STRINGS = new WeakSet<luau.InterpolatedString>();

export function markInterpolatedStringPrimitive(expression: luau.InterpolatedString) {
	PRIMITIVE_INTERPOLATED_STRINGS.add(expression);
}

function summarizeList(state: TransformState, list: luau.List<luau.Expression>): EffectSummary {
	let result = PURE_SUMMARY;
	luau.list.forEach(list, expression => (result = unionSummaries(result, summarizeExpression(state, expression))));
	return result;
}

/**
 * A value that is definitely a non-nil number and whose evaluation cannot itself error:
 * number literals, compiler temporaries (macro-emitted loop keys, counters, and lengths are
 * always numbers), `#x`, and arithmetic over such. Used to decide whether a fresh-table
 * write or a `table.insert`/`table.move` position argument can be a runtime error.
 */
function isCompilerNumeric(expression: luau.Expression): boolean {
	if (luau.isNumberLiteral(expression) || luau.isTemporaryIdentifier(expression)) {
		return true;
	}
	/* istanbul ignore next -- macro-emitted positions are not parenthesized */
	if (luau.isParenthesizedExpression(expression)) {
		return isCompilerNumeric(expression.expression);
	}
	if (luau.isUnaryExpression(expression) && expression.operator === "#") {
		return true;
	}
	if (
		luau.isBinaryExpression(expression) &&
		(expression.operator === "+" || expression.operator === "-" || expression.operator === "*")
	) {
		return isCompilerNumeric(expression.left) && isCompilerNumeric(expression.right);
	}
	/* istanbul ignore next -- conservative default for uncontrolled shapes */
	return false;
}

function summarizeCall(state: TransformState, node: luau.CallExpression, tsNode?: ts.Expression): EffectSummary {
	// recognized by tag (which survives node cloning) with a Map fallback for the originals
	let builtin = (node.expression as TaggedNode)[BUILTIN_CALL_TAG] ?? BUILTIN_CALL_SUMMARIES.get(node.expression);
	if (builtin === SORT_BUILTIN) {
		// table.sort runs a user comparator only when one is passed (array + comparator)
		builtin = luau.list.size(node.args) <= 1 ? MUTATES_HEAP_SUMMARY : undefined;
	}
	if (builtin === INSERT_BUILTIN || builtin === MOVE_BUILTIN) {
		// these mutate a specific argument: insert writes arg 1; move writes arg 5 when
		// present (else arg 1) and reads its source (arg 1). When the mutated table is a
		// block-fresh temp the write is invisible (see freshTempIds), leaving only source
		// reads and — if a position/range argument is not a compiler-controlled numeric —
		// a possible error.
		const args = luau.list.toArray(node.args);
		const target = builtin === MOVE_BUILTIN && args.length >= 5 ? args[4] : args[0];
		if (target !== undefined && luau.isTemporaryIdentifier(target) && freshTempIds.has(target.id)) {
			const controlArgs = builtin === MOVE_BUILTIN ? args.slice(1, 4) : args.length > 2 ? [args[1]] : [];
			builtin = {
				...PURE_SUMMARY,
				readsHeap: builtin === MOVE_BUILTIN ? HEAP_TABLES : HEAP_NONE,
				throws: !controlArgs.every(isCompilerNumeric),
			};
		} else {
			builtin = MUTATES_HEAP_SUMMARY;
		}
	}
	if (builtin === undefined) {
		// a callee statically bound to an analyzed function body: the call's effects are the
		// body's summary, plus evaluating the callee reference and arguments
		const calleeSummary = (node.expression as TaggedNode)[CALLEE_SUMMARY_TAG];
		if (calleeSummary !== undefined) {
			return unionSummaries(
				unionSummaries(calleeSummary, summarizeExpression(state, node.expression)),
				summarizeList(state, node.args),
			);
		}
		// engine-value refinement: immutable data type construction/statics classify by the
		// source node (`new Vector3(…)` and `CFrame.lookAt(…)` both emit plain calls)
		if (tsNode) {
			const source = skipDownwards(tsNode);
			let known: EffectSummary | undefined;
			if (ts.isNewExpression(source)) {
				known = summarizeKnownConstruction(state, source);
			} else if (ts.isCallExpression(source)) {
				const callee = skipDownwards(source.expression);
				if (ts.isPropertyAccessExpression(callee)) {
					known = summarizeKnownEngineCall(state, callee);
				}
			}
			if (known !== undefined) {
				return unionSummaries(known, summarizeList(state, node.args));
			}
		}
		return CALLS_UNKNOWN_SUMMARY;
	}
	return unionSummaries(builtin, summarizeList(state, node.args));
}

/**
 * Read-only, non-yielding Instance methods that never invoke user code (no callbacks, no
 * signal dispatch) — they only inspect engine state. Their arguments are constrained by
 * `@rbxts/types`, so typed usage does not error. Anything not listed stays unknown code:
 * engine calls in general may mutate engine state, run user handlers synchronously
 * (`BindableFunction:Invoke`), or yield (letting other user threads interleave).
 */
const READONLY_INSTANCE_METHODS = new Set([
	"FindFirstAncestor",
	"FindFirstAncestorOfClass",
	"FindFirstAncestorWhichIsA",
	"FindFirstChild",
	"FindFirstChildOfClass",
	"FindFirstChildWhichIsA",
	"GetAttribute",
	"GetAttributeChangedSignal",
	"GetAttributes",
	"GetChildren",
	"GetDescendants",
	"GetFullName",
	"GetMass",
	"GetPivot",
	"GetPropertyChangedSignal",
	"GetTags",
	"HasTag",
	"IsA",
	"IsAncestorOf",
	"IsDescendantOf",
]);

/**
 * True if the type is definitely a plain Lua table: non-nil, not declared by
 * `@rbxts/types` (Instances, datatypes, and other userdata all come from there), and a
 * non-callable object type.
 */
function isDefinitelyPlainTable(state: TransformState, type: ts.Type): boolean {
	return (
		!isPossiblyType(type, isUndefinedType, isAnyType(state)) &&
		!isPossiblyType(type, isRobloxType(state)) &&
		isDefinitelyType(type, t => isObjectType(t) && t.getCallSignatures().length === 0)
	);
}

/**
 * The heap region of the value a definitely-non-nil expression of this type holds, or
 * `undefined` when unknown: Instances live in the engine-state region; non-Roblox,
 * non-callable object types are plain Lua tables.
 */
function classifyValueRegion(state: TransformState, node: ts.Expression): HeapRegions | undefined {
	const type = state.getType(node);
	if (isPossiblyType(type, isUndefinedType, isAnyType(state))) {
		return undefined;
	}
	if (isDefinitelyType(type, isInstanceType(state))) {
		return HEAP_INSTANCES;
	}
	if (isDefinitelyPlainTable(state, type)) {
		return HEAP_TABLES;
	}
	return undefined;
}

/**
 * Records the heap region of the value held by an emitted operand expression, derived from
 * its TS type. Macro-emitted member accesses through the operand (`arr[_length] = nil`,
 * `#arr`, …) have no source node of their own; the tag (which survives clones, and is
 * propagated to capture temporaries by `pushToVar`) lets them classify by base instead of
 * falling back to "any region, may throw".
 */
export function tagValueRegion(state: TransformState, expression: luau.Expression, node: ts.Expression) {
	const region = classifyValueRegion(state, node);
	if (region !== undefined) {
		(expression as TaggedNode)[VALUE_REGION_TAG] = region;
	}
}

function getValueRegion(expression: luau.Expression): HeapRegions | undefined {
	while (luau.isParenthesizedExpression(expression)) {
		expression = expression.expression;
	}
	return (expression as TaggedNode)[VALUE_REGION_TAG];
}

/**
 * Classification of a member read through a base: reading a field of an immutable Roblox
 * data type is pure; reading from an Instance touches engine state and may throw (typed
 * child accesses are real lookups that can fail); reading from a definitely-non-nil,
 * non-callable user table cannot throw (plain table indexing never errors, and roblox-ts
 * class metatables resolve `__index` through table chains, never functions) and touches
 * only the table region. Classified by the base's source node when aligned, else by a
 * value-region tag on the emitted base expression (see `tagValueRegion`).
 */
export function summarizeMemberRead(
	state: TransformState,
	baseNode: ts.Expression | undefined,
	baseExpression?: luau.Expression,
): EffectSummary {
	if (baseNode) {
		const type = state.getType(baseNode);
		if (
			!isPossiblyType(type, isUndefinedType, isAnyType(state)) &&
			(isDefinitelyType(type, isImmutableRobloxDataType(state)) ||
				isDefinitelyType(type, isImmutableRobloxDataTypeConstructor(state)))
		) {
			return PURE_SUMMARY;
		}
	}
	const region = baseNode ? classifyValueRegion(state, baseNode) : undefined;
	const tagged = region ?? (baseExpression ? getValueRegion(baseExpression) : undefined);
	if (tagged === HEAP_INSTANCES) {
		return READS_INSTANCES_THROWS_SUMMARY;
	}
	if (tagged === HEAP_TABLES) {
		return READS_TABLES_SUMMARY;
	}
	return READS_ALL_THROWS_SUMMARY;
}

/**
 * Classification of a member write through a base with the given source node.
 *
 * A write to a definitely-table base only writes the table region, though it can still
 * throw (frozen tables). A write to an Instance — or to a base we cannot classify, which
 * may be an Instance — is treated as *unknown code*: property writes fire the
 * `Changed`/`GetPropertyChangedSignal` family, and under `SignalBehavior.Immediate` those
 * handlers run synchronously and may read or write anything, including locals they close
 * over. (Engine APIs cannot touch Luau locals directly, but signal handlers are ordinary
 * user closures.)
 */
export function summarizeMemberWrite(state: TransformState, baseNode: ts.Expression | undefined): EffectSummary {
	if (baseNode && isDefinitelyPlainTable(state, state.getType(baseNode))) {
		return { ...PURE_SUMMARY, writesHeap: HEAP_TABLES, throws: true };
	}
	return CALLS_UNKNOWN_SUMMARY;
}

/**
 * Summary for a call with a property-access callee that is statically known to be a tame
 * engine API, or `undefined` when unknown: methods of immutable Roblox data types are pure
 * value computations; allowlisted read-only Instance methods only read
 * engine state. Static methods on datatype constructors are deliberately excluded: value
 * immutability says nothing about clock/RNG reads or argument-dependent errors. Argument
 * effects are the caller's responsibility.
 */
export function summarizeKnownEngineCall(
	state: TransformState,
	callee: ts.PropertyAccessExpression,
): EffectSummary | undefined {
	const receiverType = state.getType(callee.expression);
	if (isPossiblyType(receiverType, isUndefinedType, isAnyType(state))) {
		return undefined;
	}
	if (isDefinitelyType(receiverType, isImmutableRobloxDataType(state))) {
		return PURE_SUMMARY;
	}
	if (isDefinitelyType(receiverType, isInstanceType(state)) && READONLY_INSTANCE_METHODS.has(callee.name.text)) {
		return READS_INSTANCES_SUMMARY;
	}
	return undefined;
}

/** Summary for `new X(…)` when `X` constructs an immutable Roblox data type. */
export function summarizeKnownConstruction(state: TransformState, node: ts.NewExpression): EffectSummary | undefined {
	if (isDefinitelyType(state.getType(node.expression), isImmutableRobloxDataTypeConstructor(state))) {
		return PURE_SUMMARY;
	}
	return undefined;
}

/**
 * Computes a conservative effect summary for a generated Luau expression.
 *
 * `node` is an optional TypeScript source node corresponding to `expression`, used to
 * refine identifiers to const-ness when they were not created through
 * `transformIdentifierDefined` (which records const-ness on the node itself).
 */
export function summarizeExpression(
	state: TransformState,
	expression: luau.Expression,
	node?: ts.Expression,
): EffectSummary {
	// during macro-capture analysis, certain operand subtrees are accounted for separately
	// and must not contribute their own effects to the surrounding summary
	if (maskedOperandTags !== undefined) {
		const tag = (expression as TaggedNode)[OPERAND_TAG];
		if (tag !== undefined && maskedOperandTags.has(tag)) {
			return PURE_SUMMARY;
		}
	}
	// a bare reference to one of the compiler's builtin globals (`typeof`, `table.insert`,
	// `string.find`, …) is a pure read; the *call's* effect is applied in `summarizeCall`
	if ((expression as TaggedNode)[BUILTIN_CALL_TAG] !== undefined || (expression as TaggedNode)[BUILTIN_GLOBAL_TAG]) {
		return PURE_SUMMARY;
	}
	if (luau.isSimplePrimitive(expression) || luau.isNone(expression)) {
		return PURE_SUMMARY;
	} else if (luau.isTemporaryIdentifier(expression)) {
		return PURE_SUMMARY;
	} else if (luau.isIdentifier(expression)) {
		if (
			BUILTIN_GLOBAL_IDS.has(expression) ||
			(expression as TaggedNode)[BUILTIN_GLOBAL_TAG] ||
			state.isConstIdentifier(expression)
		) {
			return PURE_SUMMARY;
		}
		/* istanbul ignore next -- identifiers are const-marked at creation; the source-node
		fallback is kept for robustness against transforms that bypass it */
		if (node) {
			const idNode = skipDownwards(node);
			if (ts.isIdentifier(idNode)) {
				const symbol = state.typeChecker.getSymbolAtLocation(idNode);
				if (symbol && !isSymbolMutable(state, symbol)) {
					return PURE_SUMMARY;
				}
			}
		}
		return readsLocal(expression.name);
	} else if (luau.isFunctionExpression(expression)) {
		// allocating a closure is unobservable; its body only runs when called
		return PURE_SUMMARY;
	} else if (luau.isParenthesizedExpression(expression)) {
		return summarizeExpression(state, expression.expression, node);
	} else if (luau.isPropertyAccessExpression(expression) || luau.isComputedIndexExpression(expression)) {
		// align the ts node when shapes match so the base's type can refine the read (and
		// recursively, reads further down the chain)
		let baseNode: ts.Expression | undefined;
		if (node) {
			const tsNode = skipDownwards(node);
			if (
				luau.isPropertyAccessExpression(expression) &&
				ts.isPropertyAccessExpression(tsNode) &&
				tsNode.name.text === expression.name
			) {
				baseNode = tsNode.expression;
			} else if (luau.isComputedIndexExpression(expression) && ts.isElementAccessExpression(tsNode)) {
				baseNode = tsNode.expression;
			}
		}
		let result = summarizeExpression(state, expression.expression, baseNode);
		if (luau.isComputedIndexExpression(expression)) {
			result = unionSummaries(result, summarizeExpression(state, expression.index));
		}
		// getters do not exist in roblox-ts, so member reads never run user code
		return unionSummaries(result, summarizeMemberRead(state, baseNode, expression.expression));
	} else if (luau.isUnaryExpression(expression)) {
		const inner = summarizeExpression(state, expression.expression);
		return expression.operator === "#" ? unionSummaries(inner, READS_HEAP_SUMMARY) : inner;
	} else if (luau.isBinaryExpression(expression)) {
		// TS restricts operator usage such that compiler-emitted binary operators never
		// invoke user-defined metamethods
		return unionSummaries(
			summarizeExpression(state, expression.left),
			summarizeExpression(state, expression.right),
		);
	} else if (luau.isIfExpression(expression)) {
		return unionSummaries(
			summarizeExpression(state, expression.condition),
			unionSummaries(
				summarizeExpression(state, expression.expression),
				summarizeExpression(state, expression.alternative),
			),
		);
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		return summarizeList(state, expression.members);
	} else if (luau.isMap(expression)) {
		let result = PURE_SUMMARY;
		luau.list.forEach(expression.fields, field => {
			result = unionSummaries(result, summarizeExpression(state, field.index));
			result = unionSummaries(result, summarizeExpression(state, field.value));
		});
		return result;
	} else if (luau.isInterpolatedString(expression)) {
		// interpolating a table invokes its `__tostring` metamethod, which roblox-ts maps
		// user-defined `toString()` methods onto — so unless every interpolated value is
		// known to be a primitive (marked at creation via markInterpolatedStringPrimitive),
		// interpolation may run arbitrary user code
		let result = PURE_SUMMARY;
		let hasExpressionParts = false;
		luau.list.forEach(expression.parts, part => {
			if (!luau.isInterpolatedStringPart(part)) {
				hasExpressionParts = true;
				result = unionSummaries(result, summarizeExpression(state, part));
			}
		});
		if (hasExpressionParts && !PRIMITIVE_INTERPOLATED_STRINGS.has(expression)) {
			return CALLS_UNKNOWN_SUMMARY;
		}
		return result;
	} else if (luau.isCallExpression(expression)) {
		return summarizeCall(state, expression, node);
	} else if (luau.isMethodCallExpression(expression)) {
		// engine-call refinement: classify by the receiver's type when the source aligns
		if (node) {
			const tsNode = skipDownwards(node);
			if (ts.isCallExpression(tsNode)) {
				const callee = skipDownwards(tsNode.expression);
				if (ts.isPropertyAccessExpression(callee) && callee.name.text === expression.name) {
					const known = summarizeKnownEngineCall(state, callee);
					if (known !== undefined) {
						let result = unionSummaries(
							known,
							summarizeExpression(state, expression.expression, callee.expression),
						);
						luau.list.forEach(
							expression.args,
							arg => (result = unionSummaries(result, summarizeExpression(state, arg))),
						);
						return result;
					}
				}
			}
		}
		return CALLS_UNKNOWN_SUMMARY;
	}
	/* istanbul ignore next -- generality: current transforms do not place these constructs
	in summarized positions */
	if (luau.isVarArgsLiteral(expression)) {
		return PURE_SUMMARY;
	} else if (luau.isMixedTable(expression)) {
		let result = PURE_SUMMARY;
		luau.list.forEach(expression.fields, field => {
			if (luau.isMapField(field)) {
				result = unionSummaries(result, summarizeExpression(state, field.index));
				result = unionSummaries(result, summarizeExpression(state, field.value));
			} else {
				result = unionSummaries(result, summarizeExpression(state, field));
			}
		});
		return result;
	}
	/* istanbul ignore next -- conservative default for unmodeled expressions */
	return CALLS_UNKNOWN_SUMMARY;
}

/** A table constructor, or a call to a builtin returning a fresh, metatable-less table. */
function isFreshTableInitializer(expression: luau.Expression): boolean {
	if (luau.isTable(expression)) {
		return true;
	}
	return luau.isCallExpression(expression) && (expression.expression as TaggedNode)[BUILTIN_FRESH_TAG] === true;
}

function summarizeWritable(state: TransformState, writable: luau.WritableExpression): EffectSummary {
	if (luau.isTemporaryIdentifier(writable)) {
		return PURE_SUMMARY;
	} else if (luau.isIdentifier(writable)) {
		return { ...PURE_SUMMARY, writesLocals: new Set([writable.name]) };
	}
	// a direct write into a block-fresh table (see freshTempIds) aliases nothing
	// user-visible and runs no metamethods; it can still throw when a computed key might be
	// nil/NaN at runtime, so only compiler-controlled keys drop the throw
	const base = writable.expression;
	if (luau.isTemporaryIdentifier(base) && freshTempIds.has(base.id)) {
		if (luau.isComputedIndexExpression(writable)) {
			const index = writable.index;
			const indexSummary = summarizeExpression(state, index);
			if (luau.isStringLiteral(index) || isCompilerNumeric(index)) {
				return indexSummary;
			}
			/* istanbul ignore next -- no current macro writes an uncontrolled key into a fresh table */
			return unionSummaries(indexSummary, { ...PURE_SUMMARY, throws: true });
		}
		/* istanbul ignore next -- no current macro writes a named property into a fresh table */
		return PURE_SUMMARY;
	}
	// property access / computed index write: no source node at statement level, but the
	// base may carry a value-region tag. A definitely-table write only writes the table
	// region (it can still throw — frozen tables). A write through an Instance — or a base
	// we cannot classify, which may be an Instance — is unknown code: property writes fire
	// the Changed/GetPropertyChangedSignal family, and under SignalBehavior.Immediate those
	// handlers run synchronously and may read or write anything, including locals.
	if (getValueRegion(base) !== HEAP_TABLES) {
		return CALLS_UNKNOWN_SUMMARY;
	}
	let result = unionSummaries(summarizeExpression(state, writable.expression), {
		...PURE_SUMMARY,
		writesHeap: HEAP_TABLES,
		throws: true,
	});
	if (luau.isComputedIndexExpression(writable)) {
		result = unionSummaries(result, summarizeExpression(state, writable.index));
	}
	return result;
}

function summarizeWritables(
	state: TransformState,
	left:
		| luau.WritableExpression
		| luau.AnyIdentifier
		| luau.List<luau.WritableExpression>
		| luau.List<luau.AnyIdentifier>,
): EffectSummary {
	if (luau.list.isList(left)) {
		let result = PURE_SUMMARY;
		luau.list.forEach(left, writable => (result = unionSummaries(result, summarizeWritable(state, writable))));
		return result;
	}
	return summarizeWritable(state, left);
}

function summarizeExpressionOrList(
	state: TransformState,
	value: luau.Expression | luau.List<luau.Expression> | undefined,
): EffectSummary {
	if (value === undefined) {
		return PURE_SUMMARY;
	}
	/* istanbul ignore next -- expression-list initializers do not occur in analyzed positions */
	if (luau.list.isList(value)) {
		return summarizeList(state, value);
	}
	return summarizeExpression(state, value);
}

export function summarizeStatement(state: TransformState, statement: luau.Statement): EffectSummary {
	if (luau.isVariableDeclaration(statement)) {
		// statement lists are summarized in order, so a fresh-table temp is tagged here
		// before any of the writes into it are summarized (the tag is permanent — temps are
		// single-assignment)
		if (
			!luau.list.isList(statement.left) &&
			luau.isTemporaryIdentifier(statement.left) &&
			statement.right !== undefined &&
			!luau.list.isList(statement.right) &&
			isFreshTableInitializer(statement.right)
		) {
			freshTempIds.add(statement.left.id);
		}
		// declaring a user-named local counts as a write so shadowing is conservatively safe
		return unionSummaries(
			summarizeWritables(state, statement.left),
			summarizeExpressionOrList(state, statement.right),
		);
	} else if (luau.isAssignment(statement)) {
		return unionSummaries(
			summarizeWritables(state, statement.left),
			summarizeExpressionOrList(state, statement.right),
		);
	} else if (luau.isCallStatement(statement)) {
		return luau.isCallExpression(statement.expression)
			? summarizeCall(state, statement.expression)
			: CALLS_UNKNOWN_SUMMARY;
	} else if (luau.isIfStatement(statement)) {
		let result = unionSummaries(
			summarizeExpression(state, statement.condition),
			summarizeStatements(state, statement.statements),
		);
		/* istanbul ignore else -- macros do not emit elseif chains */
		if (luau.list.isList(statement.elseBody)) {
			result = unionSummaries(result, summarizeStatements(state, statement.elseBody));
		} else {
			result = unionSummaries(result, summarizeStatement(state, statement.elseBody));
		}
		return result;
	} else if (luau.isForStatement(statement)) {
		// loop bindings are always compiler temps; iterating a typed table cannot throw
		return unionSummaries(
			unionSummaries(summarizeExpression(state, statement.expression), READS_HEAP_SUMMARY),
			summarizeStatements(state, statement.statements),
		);
	} else if (luau.isNumericForStatement(statement)) {
		let result = unionSummaries(
			summarizeExpression(state, statement.start),
			summarizeExpression(state, statement.end),
		);
		/* istanbul ignore next -- no macro emits a stepped numeric loop */
		if (statement.step) {
			result = unionSummaries(result, summarizeExpression(state, statement.step));
		}
		return unionSummaries(result, summarizeStatements(state, statement.statements));
	} else if (luau.isWhileStatement(statement) || luau.isRepeatStatement(statement)) {
		return unionSummaries(
			summarizeExpression(state, statement.condition),
			summarizeStatements(state, statement.statements),
		);
	} else if (luau.isDoStatement(statement)) {
		return summarizeStatements(state, statement.statements);
	} else if (luau.isBreakStatement(statement) || luau.isContinueStatement(statement) || luau.isComment(statement)) {
		return PURE_SUMMARY;
	} else if (luau.isFunctionDeclaration(statement)) {
		// bodies only run when called; the declaration itself just creates/assigns the binding
		return summarizeWritable(state, statement.name);
	} else if (luau.isMethodDeclaration(statement)) {
		return unionSummaries(summarizeExpression(state, statement.expression), {
			...PURE_SUMMARY,
			writesHeap: HEAP_TABLES,
		});
	}
	/* istanbul ignore next -- macro output does not contain return statements; anything
	unmodeled is conservatively unknown code */
	if (luau.isReturnStatement(statement)) {
		return summarizeExpressionOrList(state, statement.expression);
	}
	/* istanbul ignore next */
	return CALLS_UNKNOWN_SUMMARY;
}

export function summarizeStatements(state: TransformState, statements: luau.List<luau.Statement>): EffectSummary {
	let result = PURE_SUMMARY;
	luau.list.forEach(statements, statement => (result = unionSummaries(result, summarizeStatement(state, statement))));
	return result;
}

/**
 * True if the expression's value can neither change nor have observable effects, no matter
 * what code runs before its evaluation: its evaluation may be freely deferred, repeated,
 * or omitted. (Literals, temps, const bindings, closures/allocations of such, arithmetic
 * on such.)
 */
export function isInvariantExpression(
	state: TransformState,
	expression: luau.Expression,
	node?: ts.Expression,
): boolean {
	const summary = summarizeExpression(state, expression, node);
	return (
		!summary.calls &&
		summary.readsHeap === HEAP_NONE &&
		!summary.throws &&
		!writesAnything(summary) &&
		summary.readsLocals !== "all" &&
		summary.readsLocals.size === 0
	);
}

/**
 * Walks a macro's emitted expression in Luau evaluation order, calling `onOperand` for
 * each occurrence of a tagged operand node (and any clone of one — the tag survives
 * `luau.create`'s shallow clone). `repeated` is true when the occurrence sits in a context
 * that is not guaranteed to evaluate exactly once: loop and function bodies (many times,
 * possibly deferred past later mutations), conditional bodies, `if`-expression branches,
 * and short-circuited `and`/`or` right sides (possibly zero times), and loop conditions.
 * Operand subtrees are treated as opaque units (we do not recurse).
 */
function walkOperandsInExpression(
	expression: luau.Expression,
	repeated: boolean,
	onOperand: (tag: number, repeated: boolean) => void,
) {
	const tag = (expression as TaggedNode)[OPERAND_TAG];
	if (tag !== undefined) {
		onOperand(tag, repeated);
		return;
	}
	const walk = (e: luau.Expression) => walkOperandsInExpression(e, repeated, onOperand);
	if (luau.isParenthesizedExpression(expression) || luau.isUnaryExpression(expression)) {
		walk(expression.expression);
	} else if (luau.isPropertyAccessExpression(expression)) {
		walk(expression.expression);
	} else if (luau.isComputedIndexExpression(expression)) {
		walk(expression.expression);
		walk(expression.index);
	} else if (luau.isBinaryExpression(expression)) {
		walk(expression.left);
		if (expression.operator === "and" || expression.operator === "or") {
			// the right side is short-circuited — not guaranteed to evaluate
			walkOperandsInExpression(expression.right, true, onOperand);
		} else {
			walk(expression.right);
		}
	} else if (luau.isCallExpression(expression) || luau.isMethodCallExpression(expression)) {
		walk(expression.expression);
		luau.list.forEach(expression.args, walk);
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		luau.list.forEach(expression.members, walk);
	}
	/* istanbul ignore next -- operand-walking generality: current macros do not place
	operands inside these constructs (operand-position closures return at the tag check) */
	if (luau.isFunctionExpression(expression)) {
		// the body runs when the closure is called — treat every operand inside as repeated
		walkOperandsInStatements(expression.statements, true, onOperand);
	} else if (luau.isIfExpression(expression)) {
		walk(expression.condition);
		// only one branch evaluates — neither is guaranteed to run
		walkOperandsInExpression(expression.expression, true, onOperand);
		walkOperandsInExpression(expression.alternative, true, onOperand);
	} else if (luau.isMap(expression)) {
		luau.list.forEach(expression.fields, field => {
			walk(field.index);
			walk(field.value);
		});
	} else if (luau.isMixedTable(expression)) {
		luau.list.forEach(expression.fields, field => {
			if (luau.isMapField(field)) {
				walk(field.index);
				walk(field.value);
			} else {
				walk(field);
			}
		});
	} else if (luau.isInterpolatedString(expression)) {
		luau.list.forEach(expression.parts, part => {
			if (!luau.isInterpolatedStringPart(part)) {
				walk(part);
			}
		});
	}
	// identifiers, temporaries, literals, varargs: no operand-bearing subexpressions
}

function walkOperandsInStatements(
	statements: luau.List<luau.Statement>,
	repeated: boolean,
	onOperand: (tag: number, repeated: boolean) => void,
) {
	luau.list.forEach(statements, statement => walkOperandsInStatement(statement, repeated, onOperand));
}

function walkOperandsInStatement(
	statement: luau.Statement,
	repeated: boolean,
	onOperand: (tag: number, repeated: boolean) => void,
) {
	const expr = (e: luau.Expression) => walkOperandsInExpression(e, repeated, onOperand);
	// contexts that may evaluate other than exactly once: loop/function bodies run many
	// times, conditional bodies possibly zero times, loop conditions once per iteration
	const unsafeExpr = (e: luau.Expression) => walkOperandsInExpression(e, true, onOperand);
	const unsafeBody = (s: luau.List<luau.Statement>) => walkOperandsInStatements(s, true, onOperand);
	const body = (s: luau.List<luau.Statement>) => walkOperandsInStatements(s, repeated, onOperand);

	if (luau.isVariableDeclaration(statement) || luau.isAssignment(statement)) {
		const left = statement.left;
		/* istanbul ignore if -- multi-value declarations appear only in operand prereqs,
		which are emitted before the trial and never walked */
		if (luau.list.isList(left)) {
			luau.list.forEach(left, expr);
		} else {
			expr(left);
		}
		const right = statement.right;
		if (right !== undefined) {
			/* istanbul ignore if -- see above */
			if (luau.list.isList(right)) {
				luau.list.forEach(right, expr);
			} else {
				expr(right);
			}
		}
	} else if (luau.isCallStatement(statement)) {
		expr(statement.expression);
	} else if (luau.isIfStatement(statement)) {
		expr(statement.condition);
		unsafeBody(statement.statements);
		/* istanbul ignore else -- macros do not emit elseif chains */
		if (luau.list.isList(statement.elseBody)) {
			unsafeBody(statement.elseBody);
		} else {
			// elseif chain: its condition and bodies are all conditionally reached
			walkOperandsInStatement(statement.elseBody, true, onOperand);
		}
	} else if (luau.isForStatement(statement)) {
		expr(statement.expression);
		unsafeBody(statement.statements);
	} else if (luau.isNumericForStatement(statement)) {
		expr(statement.start);
		expr(statement.end);
		if (statement.step) expr(statement.step);
		unsafeBody(statement.statements);
	}
	/* istanbul ignore next -- operand-walking generality: current macros do not place
	operands inside these statements (returns never appear in macro output) */
	if (luau.isReturnStatement(statement)) {
		if (luau.list.isList(statement.expression)) {
			luau.list.forEach(statement.expression, expr);
		} else {
			expr(statement.expression);
		}
	} else if (luau.isWhileStatement(statement) || luau.isRepeatStatement(statement)) {
		unsafeExpr(statement.condition);
		unsafeBody(statement.statements);
	} else if (luau.isDoStatement(statement)) {
		body(statement.statements);
	} else if (luau.isFunctionDeclaration(statement) || luau.isMethodDeclaration(statement)) {
		unsafeBody(statement.statements);
	}
	// break / continue / comment: no operands
}

/** Ordered child expressions of `expression`, in Luau evaluation order. */
function orderedChildExpressions(expression: luau.Expression): Array<luau.Expression> {
	if (luau.isParenthesizedExpression(expression) || luau.isUnaryExpression(expression)) {
		return [expression.expression];
	} else if (luau.isPropertyAccessExpression(expression)) {
		return [expression.expression];
	} else if (luau.isComputedIndexExpression(expression)) {
		return [expression.expression, expression.index];
	} else if (luau.isBinaryExpression(expression)) {
		return [expression.left, expression.right];
	} else if (luau.isIfExpression(expression)) {
		// only one branch runs, but including both over-approximates "before" safely
		return [expression.condition, expression.expression, expression.alternative];
	} else if (luau.isCallExpression(expression) || luau.isMethodCallExpression(expression)) {
		return [expression.expression, ...luau.list.toArray(expression.args)];
	}
	/* istanbul ignore next -- child-walking generality: current macros do not build these
	constructs around analyzed subexpressions (table children short-circuit at the
	allocation check) */
	if (luau.isArray(expression) || luau.isSet(expression)) {
		return luau.list.toArray(expression.members);
	} else if (luau.isMap(expression)) {
		return luau.list.toArray(expression.fields).flatMap(field => [field.index, field.value]);
	} else if (luau.isMixedTable(expression)) {
		return luau.list
			.toArray(expression.fields)
			.flatMap(field => (luau.isMapField(field) ? [field.index, field.value] : [field]));
	} else if (luau.isInterpolatedString(expression)) {
		return luau.list
			.toArray(expression.parts)
			.filter((p): p is luau.Expression => !luau.isInterpolatedStringPart(p));
	}
	// function-expression bodies are deferred; leaves have no children
	return [];
}

/**
 * The direct child of `expression` whose value Luau reads *at the consuming instruction*
 * rather than at the child's own position. Locals are registers: an identifier used as an
 * arithmetic/comparison operand (`ADD`, `EQ`, …) or as a computed index's base
 * (`GETTABLE`) is read when the instruction executes — after the sibling operand's inline
 * code has already run. (Call/method arguments, table constructor fields, and `..` chains
 * discharge each operand into a register at its own position, and `and`/`or` test the left
 * register before the right side runs, so those stay strictly ordered.)
 */
function lazilyReadChild(expression: luau.Expression): luau.Expression | undefined {
	if (luau.isBinaryExpression(expression) && expression.operator !== "and" && expression.operator !== "or") {
		return expression.left;
	}
	if (luau.isComputedIndexExpression(expression)) {
		return expression.expression;
	}
	return undefined;
}

/**
 * Summary of everything evaluated strictly *before* the single occurrence of `target`
 * within `expression`, or `undefined` if `target` is not inside it. Because a parent
 * operation always runs after all its children, only the target's left-siblings (and their
 * descendants) at each level of the path contribute — except when the target is a local
 * read placed in a lazily-read register position (see `lazilyReadChild`), where the
 * sibling operands' code also precedes the read. `maskedOperandTags` must be set to the
 * earlier-canonical operands so they are excluded.
 */
function beforeSummaryInExpression(
	state: TransformState,
	expression: luau.Expression,
	target: number,
): EffectSummary | undefined {
	const tag = (expression as TaggedNode)[OPERAND_TAG];
	if (tag !== undefined) {
		return tag === target ? PURE_SUMMARY : undefined;
	}
	const children = orderedChildExpressions(expression);
	const lazyChild = lazilyReadChild(expression);
	let left = PURE_SUMMARY;
	for (const child of children) {
		const before = beforeSummaryInExpression(state, child, target);
		if (before !== undefined) {
			let result = unionSummaries(left, before);
			if (child === lazyChild && luau.isIdentifier(child) && (child as TaggedNode)[OPERAND_TAG] === target) {
				// the operand is itself the lazily-read register: every sibling operand's
				// code runs before its value is read
				for (const sibling of children) {
					if (sibling !== child) {
						result = unionSummaries(result, summarizeExpression(state, sibling));
					}
				}
			}
			return result;
		}
		left = unionSummaries(left, summarizeExpression(state, child));
	}
	return undefined;
}

function statementContainsOperand(statement: luau.Statement, target: number): boolean {
	let found = false;
	walkOperandsInStatement(statement, false, tag => {
		if (tag === target) found = true;
	});
	return found;
}

/**
 * Summary of everything the macro evaluates strictly before the single occurrence of
 * operand `target`. Earlier-canonical operands (tag < target) are excluded; later operands
 * and the macro's own effects that precede `target` are included.
 */
function computeBeforeSummary(
	state: TransformState,
	prereqs: luau.List<luau.Statement>,
	result: luau.Expression,
	target: number,
): EffectSummary {
	const earlier = new Set<number>();
	for (let j = 0; j < target; j++) earlier.add(j);

	maskedOperandTags = earlier;
	try {
		let acc = PURE_SUMMARY;
		let handled = false;
		luau.list.forEach(prereqs, statement => {
			if (handled) return;
			const before = beforeSummaryInStatement(state, statement, target, earlier);
			if (before !== undefined) {
				acc = unionSummaries(acc, before);
				handled = true;
			} else {
				// this statement fully precedes the one holding the target
				acc = unionSummaries(acc, summarizeStatement(state, statement));
			}
		});
		if (!handled) {
			acc = unionSummaries(acc, beforeSummaryInExpression(state, result, target) ?? PURE_SUMMARY);
		}
		return acc;
	} finally {
		maskedOperandTags = undefined;
	}
}

/** Before-summary of `target` within a single statement, or `undefined` if not inside it. */
function beforeSummaryInStatement(
	state: TransformState,
	statement: luau.Statement,
	target: number,
	earlier: ReadonlySet<number>,
): EffectSummary | undefined {
	// for these, the statement's own effect (the call, the binding) happens after the
	// expression that may hold the target, so precise left-sibling ordering is exact
	if (luau.isCallStatement(statement)) {
		return beforeSummaryInExpression(state, statement.expression, target);
	} else if (luau.isVariableDeclaration(statement)) {
		return statement.right !== undefined
			? beforeSummaryInExpressionOrList(state, statement.right, target)
			: undefined;
	}
	/* istanbul ignore next -- macro output does not contain return statements */
	if (luau.isReturnStatement(statement)) {
		return beforeSummaryInExpressionOrList(state, statement.expression, target);
	}
	// assignments (base/index/rhs order not fully defined) and control-flow: if the target is
	// inside, conservatively treat every other effect of the statement as preceding it
	if (!statementContainsOperand(statement, target)) {
		return undefined;
	}
	const withTarget = new Set(earlier);
	withTarget.add(target);
	maskedOperandTags = withTarget;
	try {
		return summarizeStatement(state, statement);
	} finally {
		maskedOperandTags = earlier;
	}
}

function beforeSummaryInExpressionOrList(
	state: TransformState,
	value: luau.Expression | luau.List<luau.Expression>,
	target: number,
): EffectSummary | undefined {
	/* istanbul ignore if -- list-valued positions (multi-value declarations) do not hold
	operands today */
	if (luau.list.isList(value)) {
		let left = PURE_SUMMARY;
		let found: EffectSummary | undefined;
		luau.list.forEach(value, expression => {
			if (found !== undefined) return;
			const before = beforeSummaryInExpression(state, expression, target);
			if (before !== undefined) {
				found = unionSummaries(left, before);
			} else {
				left = unionSummaries(left, summarizeExpression(state, expression));
			}
		});
		return found;
	}
	return beforeSummaryInExpression(state, value, target);
}

/**
 * True if `expression` contains a table or closure constructor — or any call — anywhere.
 * Re-evaluating such an expression can produce a fresh (distinct) object each time, even
 * when its effect summary is pure: `if cond then {1} else {2}` allocates per evaluation,
 * and a call to an effect-free function may still return a new table per call (effect
 * purity says nothing about value stability). The exception is a call whose callee is
 * tagged as definitely returning a primitive (see `tagCalleeSummary`) — primitives have no
 * identity, so equal evaluations are indistinguishable; its callee/argument subtrees are
 * still checked.
 */
function containsAllocation(expression: luau.Expression): boolean {
	if (luau.isTable(expression) || luau.isFunctionExpression(expression) || luau.isMethodCallExpression(expression)) {
		return true;
	}
	if (luau.isCallExpression(expression) && !(expression.expression as TaggedNode)[RETURNS_PRIMITIVE_TAG]) {
		return true;
	}
	return orderedChildExpressions(expression).some(containsAllocation);
}

/**
 * True if re-evaluating `expression` yields the same value and no added effect — provided
 * nothing that reassigns its reads runs in between (checked separately by commutation).
 * Pure reads of local/global bindings qualify (heap reads may be aliased by a write;
 * anything that throws, writes, or calls unknown code is not freely repeatable), as do
 * calls to effect-free functions that definitely return primitives — a pure body reads
 * nothing mutable, so equal inputs give an equal, identity-free result.
 */
function isRepeatable(expression: luau.Expression, summary: EffectSummary): boolean {
	if (containsAllocation(expression)) {
		return false;
	}
	return !summary.calls && !summary.throws && summary.readsHeap === HEAP_NONE && !writesAnything(summary);
}

/** Summary of the macro's entire output, with operand `target` and all earlier ones masked. */
function summarizeWholeOutput(
	state: TransformState,
	prereqs: luau.List<luau.Statement>,
	result: luau.Expression,
	target: number,
): EffectSummary {
	const masked = new Set<number>();
	for (let j = 0; j <= target; j++) masked.add(j);
	maskedOperandTags = masked;
	try {
		const summary = summarizeStatements(state, prereqs);
		return unionSummaries(summary, summarizeExpression(state, result));
	} finally {
		maskedOperandTags = undefined;
	}
}

/**
 * An ordered operand as the drivers see it: the result expression(s) it transformed into
 * (a spread contributes several), the prerequisite statements it produced, and optionally
 * its source node for type refinement.
 */
export interface OrderedOperand {
	readonly expressions: ReadonlyArray<luau.Expression>;
	readonly prereqs: luau.List<luau.Statement>;
	readonly node?: ts.Expression;
}

/**
 * Decides, per operand result expression, whether it must be captured into a temporary at
 * its original position to preserve TypeScript's left-to-right evaluation order.
 *
 * In the emitted Luau, every operand's prerequisite statements run before any result
 * expression is consumed, so each result is implicitly deferred past every *later*
 * operand's prereqs — and past the evaluation of any later operand that is itself
 * captured, since its `pushToVar` assignment executes at its original position. A raw
 * later operand contributes nothing: it stays at the consumption point, after this
 * operand, matching TS order. That second term is why decisions run right-to-left (each
 * new capture can cascade further left).
 */
export function decideOrderedCaptures(
	state: TransformState,
	operands: ReadonlyArray<OrderedOperand>,
): Array<Array<boolean>> {
	const captures = operands.map(operand => new Array<boolean>(operand.expressions.length).fill(false));
	let suffix = PURE_SUMMARY;
	for (let i = operands.length - 1; i >= 0; i--) {
		const operand = operands[i];
		for (let j = operand.expressions.length - 1; j >= 0; j--) {
			const operandSummary = summarizeExpression(state, operand.expressions[j], operand.node);
			captures[i][j] = !commutes(operandSummary, suffix);
			if (captures[i][j]) {
				suffix = unionSummaries(operandSummary, suffix);
			}
		}
		suffix = unionSummaries(summarizeStatements(state, operand.prereqs), suffix);
	}
	return captures;
}

/**
 * Decides which of a macro's `operands` must be captured into temporaries so that the
 * emitted code preserves TypeScript's evaluation-order semantics (each operand evaluated
 * once, in order, before the macro's own effects).
 *
 * The macro is run via `runTrial` *after* the operands are tagged, so that the analysis
 * sees how each operand is actually used; the trial output is discarded. Operands are
 * located by a Symbol tag rather than identity, because `luau.create` clones nodes that are
 * reused within the emitted tree — the tag survives the clone, identity does not, so the
 * tags must be applied before the macro builds (and clones) its output.
 *
 * An operand is left raw (inlined) only when all of the following hold:
 * - it is embedded exactly once, in a context guaranteed to evaluate exactly once (not a
 *   loop/closure body, not a conditional branch or short-circuited operand); and
 * - its evaluation commutes with everything the macro evaluates *before* its occurrence —
 *   the macro's own preceding effects and any later operand that precedes it — which is
 *   what makes sliding it to its canonical up-front position unobservable. Unused pure
 *   operands may simply be dropped.
 *
 * Operands in not-exactly-once contexts (or used several times) may still stay raw when
 * they are freely repeatable — pure, allocation-free reads whose value the macro's own
 * effects cannot change — since evaluating such a read zero or many times is unobservable.
 *
 * Conflicts between an earlier operand `j` and a later operand `i` (j < i) are caught when
 * analyzing `j` (whose "before" can include `i`), so `i` need not re-check earlier
 * operands. The decision is conservative: any doubt results in a capture (an extra
 * temporary), never an unsafe inline.
 */
export function computeMacroCaptures(
	state: TransformState,
	operands: ReadonlyArray<luau.Expression>,
	runTrial: () => readonly [result: luau.Expression, prereqs: luau.List<luau.Statement>],
): Array<boolean> {
	const n = operands.length;
	const captures = new Array<boolean>(n).fill(false);

	// tag operands by their canonical index so occurrences (and clones) can be found; bail
	// to a safe all-capture if two slots share a node object (occurrences unattributable)
	for (let i = 0; i < n; i++) {
		/* istanbul ignore next -- defensive: the drivers never pass one node in two slots */
		if ((operands[i] as TaggedNode)[OPERAND_TAG] !== undefined) {
			for (let j = 0; j < i; j++) delete (operands[j] as TaggedNode)[OPERAND_TAG];
			return captures.fill(true);
		}
		(operands[i] as TaggedNode)[OPERAND_TAG] = i;
	}

	try {
		const [result, prereqs] = runTrial();

		const count = new Array<number>(n).fill(0);
		const repeated = new Array<boolean>(n).fill(false);
		const onOperand = (tag: number, rep: boolean) => {
			count[tag]++;
			if (rep) repeated[tag] = true;
		};
		walkOperandsInStatements(prereqs, false, onOperand);
		walkOperandsInExpression(result, false, onOperand);

		for (let i = 0; i < n; i++) {
			const opSummary = summarizeExpression(state, operands[i]);

			if (count[i] === 0) {
				// unused by the macro: only needs evaluating (once, up front) for its effects
				captures[i] = opSummary.calls || opSummary.throws || writesAnything(opSummary);
				continue;
			}

			if (count[i] > 1 || repeated[i]) {
				// evaluated more than once (or inside a loop/closure): safe to leave raw only
				// if re-evaluation is free — no effects of its own, and a value that nothing
				// the macro does can change. A pure local read qualifies (re-reading a binding
				// is free) as long as nothing between the uses reassigns it.
				if (!isRepeatable(operands[i], opSummary)) {
					captures[i] = true;
					continue;
				}
				const context = summarizeWholeOutput(state, prereqs, result, i);
				captures[i] = !commutes(opSummary, context);
				continue;
			}

			// used exactly once: safe to inline iff its evaluation commutes with everything
			// that runs before its occurrence (which is where sliding it to the canonical
			// up-front position must be unobservable)
			const before = computeBeforeSummary(state, prereqs, result, i);
			captures[i] = !commutes(opSummary, before);
		}

		// A capture evaluates its operand at the shared up-front position — before every raw
		// operand's embedded occurrence, including raw operands to its LEFT, which TS says
		// must evaluate first. Right-to-left, force-capture any raw operand that does not
		// commute with the captured operands after it (each new capture may cascade further
		// left).
		let capturedSuffix = PURE_SUMMARY;
		for (let i = n - 1; i >= 0; i--) {
			const opSummary = summarizeExpression(state, operands[i]);
			if (!captures[i] && !commutes(opSummary, capturedSuffix)) {
				captures[i] = true;
			}
			if (captures[i]) {
				capturedSuffix = unionSummaries(opSummary, capturedSuffix);
			}
		}

		return captures;
	} finally {
		for (let i = 0; i < n; i++) delete (operands[i] as TaggedNode)[OPERAND_TAG];
	}
}

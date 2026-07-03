import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { skipDownwards } from "TSTransformer/util/traversal";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import ts from "typescript";

/**
 * A conservative summary of the observable behavior of a piece of generated Luau.
 *
 * Used to decide whether evaluation of an expression can be deferred past a block of
 * statements (see `commutes`) or repeated (see `isStableAcross`) without changing
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
	/** May read through a table/userdata reference. */
	readonly readsHeap: boolean;
	/** May write through a table/userdata reference. */
	readonly writesHeap: boolean;
	/** May raise a Luau error. */
	readonly throws: boolean;
	/** May invoke unknown (user) code. Normalized: implies every other field. */
	readonly calls: boolean;
}

const EMPTY_SET: ReadonlySet<string> = new Set();

export const PURE_SUMMARY: EffectSummary = {
	readsLocals: EMPTY_SET,
	writesLocals: EMPTY_SET,
	readsHeap: false,
	writesHeap: false,
	throws: false,
	calls: false,
};

const CALLS_UNKNOWN_SUMMARY: EffectSummary = {
	readsLocals: "all",
	writesLocals: "all",
	readsHeap: true,
	writesHeap: true,
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
		readsHeap: a.readsHeap || b.readsHeap,
		writesHeap: a.writesHeap || b.writesHeap,
		throws: a.throws || b.throws,
		calls: false,
	};
}

function writesAnything(summary: EffectSummary): boolean {
	return summary.writesHeap || summary.writesLocals === "all" || summary.writesLocals.size > 0;
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
	if (a.writesHeap && (b.readsHeap || b.writesHeap)) return false;
	if (b.writesHeap && a.readsHeap) return false;
	if (a.throws && (b.throws || writesAnything(b))) return false;
	if (b.throws && writesAnything(a)) return false;
	return true;
}

/**
 * Effect summaries for calls to builtins the compiler itself emits, recognized by node
 * identity against the `luau.globals` singletons (immune to user-code name shadowing).
 * Argument summaries are unioned in by the caller. Anything not listed here is treated
 * as a call into unknown code.
 */
const BUILTIN_CALL_SUMMARIES = new Map<luau.Expression, EffectSummary>();
const READS_HEAP_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: true };
const READS_HEAP_THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: true, throws: true };
const MUTATES_HEAP_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: true, writesHeap: true };
const THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, throws: true };
{
	for (const name of [
		"byte",
		"find",
		"format",
		"gmatch",
		"gsub",
		"lower",
		"match",
		"rep",
		"reverse",
		"split",
		"sub",
		"upper",
	] as const) {
		// string.format/gsub can error on bad input; strings are immutable so no heap access
		BUILTIN_CALL_SUMMARIES.set(luau.globals.string[name], THROWS_SUMMARY);
	}
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.create, PURE_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.find, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.concat, READS_HEAP_THROWS_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.isfrozen, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.maxn, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.clone, READS_HEAP_THROWS_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.pack, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.unpack, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.insert, MUTATES_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.remove, MUTATES_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.move, MUTATES_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.clear, MUTATES_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.table.freeze, MUTATES_HEAP_SUMMARY);
	// table.sort may invoke a user comparator; handled specially in summarizeCall
	BUILTIN_CALL_SUMMARIES.set(luau.globals.math.min, PURE_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.next, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.select, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.type, PURE_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.typeof, PURE_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.getmetatable, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.setmetatable, MUTATES_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.error, THROWS_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.assert, THROWS_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.unpack, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.ipairs, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.pairs, READS_HEAP_SUMMARY);
	BUILTIN_CALL_SUMMARIES.set(luau.globals.utf8.codes, READS_HEAP_SUMMARY);
	// NOT listed (treated as unknown code): tostring (__tostring metamethods), pcall,
	// require, coroutine.yield, TS.* runtime library functions
}

/**
 * Identifier singletons from `luau.globals` (including the bases of its property accesses,
 * e.g. the `table` in `table.insert`). The compiler only emits these nodes to reference
 * true Luau/Roblox globals, which user code compiled by roblox-ts can never reassign, so
 * reads of them are free.
 */
const BUILTIN_GLOBAL_IDS = new Set<luau.Identifier>();
{
	const visit = (value: unknown) => {
		if (luau.isNode(value as luau.Node)) {
			const node = value as luau.Node;
			if (luau.isIdentifier(node)) {
				BUILTIN_GLOBAL_IDS.add(node);
			} else if (luau.isPropertyAccessExpression(node) && luau.isIdentifier(node.expression)) {
				BUILTIN_GLOBAL_IDS.add(node.expression);
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

function summarizeCall(state: TransformState, node: luau.CallExpression): EffectSummary {
	let builtin = BUILTIN_CALL_SUMMARIES.get(node.expression);
	if (node.expression === luau.globals.table.sort && luau.list.size(node.args) <= 1) {
		// without a comparator, table.sort cannot invoke user code
		builtin = MUTATES_HEAP_SUMMARY;
	}
	if (builtin === undefined) {
		return CALLS_UNKNOWN_SUMMARY;
	}
	return unionSummaries(builtin, summarizeList(state, node.args));
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
	if (luau.isSimplePrimitive(expression) || luau.isNone(expression)) {
		return PURE_SUMMARY;
	} else if (luau.isTemporaryIdentifier(expression)) {
		return PURE_SUMMARY;
	} else if (luau.isIdentifier(expression)) {
		if (BUILTIN_GLOBAL_IDS.has(expression) || state.isConstIdentifier(expression)) {
			return PURE_SUMMARY;
		}
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
	} else if (luau.isVarArgsLiteral(expression)) {
		return PURE_SUMMARY;
	} else if (luau.isFunctionExpression(expression)) {
		// allocating a closure is unobservable; its body only runs when called
		return PURE_SUMMARY;
	} else if (luau.isParenthesizedExpression(expression)) {
		return summarizeExpression(state, expression.expression, node);
	} else if (luau.isPropertyAccessExpression(expression) || luau.isComputedIndexExpression(expression)) {
		let result = summarizeExpression(state, expression.expression);
		if (luau.isComputedIndexExpression(expression)) {
			result = unionSummaries(result, summarizeExpression(state, expression.index));
		}
		// getters do not exist in roblox-ts, so member reads never run user code, but they
		// may error (nil base from a lying type assertion, Roblox Instance child access)
		return unionSummaries(result, READS_HEAP_THROWS_SUMMARY);
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
		return summarizeCall(state, expression);
	} else if (luau.isMethodCallExpression(expression)) {
		return CALLS_UNKNOWN_SUMMARY;
	}
	return CALLS_UNKNOWN_SUMMARY;
}

function summarizeWritable(state: TransformState, writable: luau.WritableExpression): EffectSummary {
	if (luau.isTemporaryIdentifier(writable)) {
		return PURE_SUMMARY;
	} else if (luau.isIdentifier(writable)) {
		return { ...PURE_SUMMARY, writesLocals: new Set([writable.name]) };
	}
	// property access / computed index write
	let result = unionSummaries(summarizeExpression(state, writable.expression), {
		...PURE_SUMMARY,
		writesHeap: true,
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
	if (luau.list.isList(value)) {
		return summarizeList(state, value);
	}
	return summarizeExpression(state, value);
}

export function summarizeStatement(state: TransformState, statement: luau.Statement): EffectSummary {
	if (luau.isVariableDeclaration(statement)) {
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
		return unionSummaries(summarizeExpression(state, statement.expression), { ...PURE_SUMMARY, writesHeap: true });
	} else if (luau.isReturnStatement(statement)) {
		return summarizeExpressionOrList(state, statement.expression);
	}
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
		!summary.readsHeap &&
		!summary.throws &&
		!writesAnything(summary) &&
		summary.readsLocals !== "all" &&
		summary.readsLocals.size === 0
	);
}

/**
 * The classes of effect a macro may perform between (or before) re-evaluations of an
 * operand it received. See `ensureReusable`.
 */
export type ReuseEffects = "heapWrites" | "userCode";

function isAllocationExpression(expression: luau.Expression): boolean {
	return luau.isFunctionExpression(expression) || luau.isTable(expression);
}

/**
 * True if re-evaluating `expression` multiple times, with effects of class `across`
 * occurring between evaluations, is observably identical to evaluating it once up front.
 *
 * - "heapWrites": the consumer only writes through tables between uses. Reads of local
 *   bindings survive this (heap writes cannot change what a binding denotes), but heap
 *   reads do not (the write may alias).
 * - "userCode": the consumer may run arbitrary user code between uses. Only expressions
 *   with no dependencies at all survive (literals, temps, const bindings).
 *
 * Allocating expressions (closures, table literals) never survive: re-evaluation would
 * create fresh objects.
 */
export function isStableAcross(
	state: TransformState,
	expression: luau.Expression,
	across: ReuseEffects,
	node?: ts.Expression,
): boolean {
	if (isAllocationExpression(expression)) {
		return false;
	}
	const summary = summarizeExpression(state, expression, node);
	if (summary.calls || writesAnything(summary)) {
		return false;
	}
	if (across === "userCode") {
		return !summary.readsHeap && !summary.throws && summary.readsLocals !== "all" && summary.readsLocals.size === 0;
	}
	// "heapWrites": local reads are fine, heap reads are not. Potential errors are also
	// unstable: TypeScript evaluates every operand before the consumer mutates anything,
	// so an error may not be observed after a heap write (e.g. `arr.push(a, s.format(x))`
	// must not run the first insertion before a throwing format call)
	return !summary.readsHeap && !summary.throws;
}

export interface OperandStabilization {
	expression: luau.Expression;
	/**
	 * Effect class the consumer performs between this operand's evaluation position and
	 * its last use. "none" imposes no reuse constraint (ordering and `multiUse` still apply).
	 */
	across: ReuseEffects | "none";
	/**
	 * The operand may be evaluated more than once (or out of source order relative to its
	 * siblings); non-simple expressions are captured so they are computed exactly once.
	 */
	multiUse?: boolean;
	/** Always capture into a fresh temporary (e.g. because it will be reassigned). */
	capture?: boolean;
	name?: string;
}

/**
 * Prepares a macro's operands for use inside the code it is about to emit, emitting
 * `local temp = <operand>` declarations (in operand order — which must be TypeScript
 * evaluation order) exactly where required.
 *
 * An operand is captured when:
 * - re-evaluating it across the declared effect class is observable (`isStableAcross`), or
 * - it is `multiUse` and not trivially cheap to re-evaluate, or
 * - leaving it raw would defer its evaluation past a *later* operand whose own evaluation
 *   it does not commute with (raw operands are evaluated wherever the macro embeds them,
 *   which is after all capture declarations emitted here).
 *
 * This is the semantic replacement for the syntactic `pushToVarIfComplex` /
 * `pushToVarIfNonId` guards previously used by macros. It must be called before the
 * macro emits any prerequisite statements of its own.
 */
export function stabilizeOperands(
	state: TransformState,
	operands: Array<OperandStabilization>,
): Array<luau.Expression> {
	// suffixSummaries[i] = combined summary of evaluating all operands after i
	const suffixSummaries = new Array<EffectSummary>(operands.length);
	let suffix = PURE_SUMMARY;
	for (let i = operands.length - 1; i >= 0; i--) {
		suffixSummaries[i] = suffix;
		suffix = unionSummaries(summarizeExpression(state, operands[i].expression), suffix);
	}

	return operands.map((operand, i) => {
		const expression = operand.expression;
		const needsCapture =
			operand.capture === true ||
			(operand.multiUse === true && !luau.isSimple(expression)) ||
			(operand.across !== "none" && !isStableAcross(state, expression, operand.across)) ||
			!commutes(summarizeExpression(state, expression), suffixSummaries[i]);
		if (!needsCapture) {
			return expression;
		}
		return state.pushToVar(expression, operand.name || valueToIdStr(expression) || "exp");
	});
}

/**
 * Returns an expression that a macro may safely evaluate multiple times while performing
 * effects of class `across` in between — either `expression` itself when re-evaluation is
 * provably unobservable, or a freshly-declared temporary capturing its value now.
 *
 * Single-operand form of `stabilizeOperands`; use that instead when the macro consumes
 * multiple operands, so that ordering between them is accounted for.
 */
export function ensureReusable(
	state: TransformState,
	expression: luau.Expression,
	across: ReuseEffects,
	name?: string,
): luau.Expression {
	return stabilizeOperands(state, [{ expression, across, multiUse: true, name }])[0];
}

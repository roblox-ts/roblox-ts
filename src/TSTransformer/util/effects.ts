import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

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

// `luau.create` clones any node that already has a parent (shallow spread), so identity is
// not stable for nodes reused across an emitted tree — but Symbol-keyed properties survive
// the spread. We tag nodes we need to recognize after they have been placed and possibly
// cloned: operands (per capture-analysis) and the compiler's own builtin globals.
type TaggedNode = luau.Expression & {
	[OPERAND_TAG]?: number;
	[BUILTIN_CALL_TAG]?: EffectSummary;
	[BUILTIN_GLOBAL_TAG]?: true;
};
const OPERAND_TAG = Symbol("operandTag");
const BUILTIN_CALL_TAG = Symbol("builtinCallSummary");
const BUILTIN_GLOBAL_TAG = Symbol("builtinGlobal");

/**
 * While set, `summarizeExpression` returns `PURE_SUMMARY` for any operand whose tag is in
 * this set. Used by `computeMacroCaptures` to summarize a macro's output while excluding
 * the operands (and their clones) whose effects are accounted for separately.
 */
let maskedOperandTags: ReadonlySet<number> | undefined;

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
 * Effect summaries for calls to builtins the compiler itself emits, recognized against the
 * `luau.globals` singletons (immune to user-code name shadowing). Recognition is by a tag
 * on the callee node (which survives cloning) with a Map fallback for the pristine
 * singletons. Argument summaries are unioned in by the caller. Anything not listed here is
 * treated as a call into unknown code.
 */
const BUILTIN_CALL_SUMMARIES = new Map<luau.Expression, EffectSummary>();
const READS_HEAP_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: true };
const READS_HEAP_THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: true, throws: true };
const MUTATES_HEAP_SUMMARY: EffectSummary = { ...PURE_SUMMARY, readsHeap: true, writesHeap: true };
const THROWS_SUMMARY: EffectSummary = { ...PURE_SUMMARY, throws: true };
// sentinel: table.sort invokes a user comparator only when one is passed (see summarizeCall)
const SORT_BUILTIN: EffectSummary = { ...PURE_SUMMARY };

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
		setBuiltinCall(luau.globals.string[name], THROWS_SUMMARY);
	}
	setBuiltinCall(luau.globals.table.create, PURE_SUMMARY);
	setBuiltinCall(luau.globals.table.find, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.concat, READS_HEAP_THROWS_SUMMARY);
	setBuiltinCall(luau.globals.table.isfrozen, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.maxn, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.clone, READS_HEAP_THROWS_SUMMARY);
	setBuiltinCall(luau.globals.table.pack, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.unpack, READS_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.insert, MUTATES_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.remove, MUTATES_HEAP_SUMMARY);
	setBuiltinCall(luau.globals.table.move, MUTATES_HEAP_SUMMARY);
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

function summarizeCall(state: TransformState, node: luau.CallExpression): EffectSummary {
	// recognized by tag (which survives node cloning) with a Map fallback for the originals
	let builtin = (node.expression as TaggedNode)[BUILTIN_CALL_TAG] ?? BUILTIN_CALL_SUMMARIES.get(node.expression);
	if (builtin === SORT_BUILTIN) {
		// table.sort runs a user comparator only when one is passed (array + comparator)
		builtin = luau.list.size(node.args) <= 1 ? MUTATES_HEAP_SUMMARY : undefined;
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
	} else if (luau.isIfExpression(expression)) {
		walk(expression.condition);
		// only one branch evaluates — neither is guaranteed to run
		walkOperandsInExpression(expression.expression, true, onOperand);
		walkOperandsInExpression(expression.alternative, true, onOperand);
	} else if (luau.isCallExpression(expression) || luau.isMethodCallExpression(expression)) {
		walk(expression.expression);
		luau.list.forEach(expression.args, walk);
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
		luau.list.forEach(expression.members, walk);
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
	} else if (luau.isFunctionExpression(expression)) {
		// the body runs when the closure is called — treat every operand inside as repeated
		walkOperandsInStatements(expression.statements, true, onOperand);
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
		if (luau.list.isList(left)) {
			luau.list.forEach(left, expr);
		} else {
			expr(left);
		}
		const right = statement.right;
		if (right !== undefined) {
			if (luau.list.isList(right)) {
				luau.list.forEach(right, expr);
			} else {
				expr(right);
			}
		}
	} else if (luau.isCallStatement(statement)) {
		expr(statement.expression);
	} else if (luau.isReturnStatement(statement)) {
		if (luau.list.isList(statement.expression)) {
			luau.list.forEach(statement.expression, expr);
		} else {
			expr(statement.expression);
		}
	} else if (luau.isIfStatement(statement)) {
		expr(statement.condition);
		unsafeBody(statement.statements);
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
	} else if (luau.isArray(expression) || luau.isSet(expression)) {
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
 * Summary of everything evaluated strictly *before* the single occurrence of `target`
 * within `expression`, or `undefined` if `target` is not inside it. Because a parent
 * operation always runs after all its children, only the target's left-siblings (and their
 * descendants) at each level of the path contribute. `maskedOperandTags` must be set to the
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
	let left = PURE_SUMMARY;
	for (const child of orderedChildExpressions(expression)) {
		const before = beforeSummaryInExpression(state, child, target);
		if (before !== undefined) {
			return unionSummaries(left, before);
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
	maskedOperandTags = undefined;
	return acc;
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
	} else if (luau.isReturnStatement(statement)) {
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
	const summary = summarizeStatement(state, statement);
	maskedOperandTags = earlier;
	return summary;
}

function beforeSummaryInExpressionOrList(
	state: TransformState,
	value: luau.Expression | luau.List<luau.Expression>,
	target: number,
): EffectSummary | undefined {
	if (!luau.list.isList(value)) {
		return beforeSummaryInExpression(state, value, target);
	}
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

/**
 * True if `expression` contains a table or closure constructor anywhere — re-evaluating
 * such an expression can produce a fresh (distinct) object each time, even when its effect
 * summary is pure (e.g. `if cond then {1} else {2}`).
 */
function containsAllocation(expression: luau.Expression): boolean {
	if (luau.isTable(expression) || luau.isFunctionExpression(expression)) {
		return true;
	}
	return orderedChildExpressions(expression).some(containsAllocation);
}

/**
 * True if re-evaluating `expression` yields the same value and no added effect — provided
 * nothing that reassigns its reads runs in between (checked separately by commutation). Only
 * pure reads of local/global bindings qualify: heap reads may be aliased by a write;
 * expressions containing table/closure constructors allocate a fresh (distinct) object each
 * time; and anything that throws, writes, or calls is not freely repeatable.
 */
function isRepeatable(expression: luau.Expression, summary: EffectSummary): boolean {
	if (containsAllocation(expression)) {
		return false;
	}
	return !summary.calls && !summary.throws && !summary.readsHeap && !writesAnything(summary);
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
	let summary = summarizeStatements(state, prereqs);
	summary = unionSummaries(summary, summarizeExpression(state, result));
	maskedOperandTags = undefined;
	return summary;
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

		return captures;
	} finally {
		for (let i = 0; i < n; i++) delete (operands[i] as TaggedNode)[OPERAND_TAG];
	}
}

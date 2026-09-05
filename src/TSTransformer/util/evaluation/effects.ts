import luau from "@roblox-ts/luau-ast";
import {
	Binding,
	getBinding,
	getBuiltinCallEffects,
	getCallEffects,
	isConstantReference,
	isPrimitiveValue,
	isStableLookup,
	markBuiltinReference,
	markConstantReference,
} from "TSTransformer/util/evaluation/facts";

type Bindings = ReadonlySet<Binding>;
const USER_READS = Symbol("bindings readable by user code");
const USER_WRITES = Symbol("bindings writable by user code");

/** effects of executing emitted code, not of merely constructing its AST. */
export interface EvaluationEffects {
	// bindings whose current values may be observed
	readonly reads: Bindings;
	// bindings that may be reassigned, not mutations to their referenced objects
	readonly writes: Bindings;
	// may read mutable shared state, such as table entries or Instance properties
	readonly readsHeap: boolean;
	// may mutate shared state without reassigning a binding
	readonly writesHeap: boolean;
	// may error or fail to terminate, preventing later evaluations
	readonly throws: boolean;
	// may create a fresh identity, such as a table or closure, that cannot be duplicated
	readonly allocates: boolean;
}

export const NO_EFFECTS: EvaluationEffects = {
	reads: new Set(),
	writes: new Set(),
	readsHeap: false,
	writesHeap: false,
	throws: false,
	allocates: false,
};

export const UNKNOWN_EFFECTS: EvaluationEffects = {
	reads: new Set([USER_READS]),
	writes: new Set([USER_WRITES]),
	readsHeap: true,
	writesHeap: true,
	throws: true,
	allocates: true,
};

const MAY_THROW = { ...NO_EFFECTS, throws: true };
const READ_HEAP = { ...MAY_THROW, readsHeap: true };
const WRITE_HEAP = { ...READ_HEAP, writesHeap: true };
const ALLOCATION = { ...NO_EFFECTS, allocates: true };

/** summarize the actual lowered body; parameters and locals belong to this invocation. */
export function getFunctionEffects(parameters: luau.List<luau.AnyIdentifier>, statements: luau.List<luau.Statement>) {
	const locals = new Set<Binding>(luau.list.toArray(parameters).map(getBinding));
	function collect(node: luau.Node) {
		if (luau.isFunctionExpression(node) || luau.isFunctionDeclaration(node)) {
			return;
		}
		if (luau.isVariableDeclaration(node)) {
			const ids = luau.list.isList(node.left) ? luau.list.toArray(node.left) : [node.left];
			ids.forEach(id => locals.add(getBinding(id)));
		}
		if (luau.isNumericForStatement(node)) {
			locals.add(getBinding(node.id));
		}
		if (luau.isForStatement(node)) {
			luau.list.forEach(node.ids, id => locals.add(getBinding(id)));
		}
		getChildren(node).forEach(collect);
	}
	luau.list.forEach(statements, collect);
	const effects = getEffects(statements);
	return {
		...effects,
		reads: new Set([...effects.reads].filter(key => !locals.has(key) && typeof key !== "number")),
		writes: new Set([...effects.writes].filter(key => !locals.has(key) && typeof key !== "number")),
	};
}

function unionBindings(a: Bindings, b: Bindings): Bindings {
	return new Set([...a, ...b]);
}

export function joinEffects(...effects: ReadonlyArray<EvaluationEffects>): EvaluationEffects {
	return effects.reduce(
		(a, b) => ({
			reads: unionBindings(a.reads, b.reads),
			writes: unionBindings(a.writes, b.writes),
			readsHeap: a.readsHeap || b.readsHeap,
			writesHeap: a.writesHeap || b.writesHeap,
			throws: a.throws || b.throws,
			allocates: a.allocates || b.allocates,
		}),
		NO_EFFECTS,
	);
}

function isExposedBinding(key: Binding, wildcard: symbol) {
	if (typeof key === "object") {
		return wildcard === USER_WRITES ? key.writtenByClosure : key.captured;
	}
	// compiler temporaries are inaccessible to user code; untracked names fail closed
	return typeof key !== "number";
}

function intersects(a: Bindings, b: Bindings): boolean {
	for (const wildcard of [USER_READS, USER_WRITES]) {
		if (a.has(wildcard) && [...b].some(key => isExposedBinding(key, wildcard))) {
			return true;
		}
		if (b.has(wildcard) && [...a].some(key => isExposedBinding(key, wildcard))) {
			return true;
		}
	}
	return [...a].some(key => b.has(key));
}

function hasWrites(effects: EvaluationEffects) {
	return effects.writesHeap || [...effects.writes].some(key => typeof key !== "number");
}

/** including errors: a failed operand must not allow a later mutation to happen. */
export function effectsCommute(a: EvaluationEffects, b: EvaluationEffects): boolean {
	return !(
		intersects(a.reads, b.writes) ||
		intersects(a.writes, b.reads) ||
		intersects(a.writes, b.writes) ||
		(a.readsHeap && b.writesHeap) ||
		(a.writesHeap && (b.readsHeap || b.writesHeap)) ||
		(a.throws && (b.throws || hasWrites(b))) ||
		(b.throws && hasWrites(a))
	);
}

export function canDiscard(effects: EvaluationEffects) {
	return !effects.throws && !hasWrites(effects);
}

export function canRepeat(effects: EvaluationEffects) {
	return canDiscard(effects) && !effects.allocates;
}

// `self` is compiler-owned and cannot be rebound by TypeScript source code.
markConstantReference(luau.globals.self);

// only compiler-owned references receive these contracts. Calls not listed here
// may execute user code, yield, throw, or allocate a new identity.
for (const expression of [luau.globals.type, luau.globals.typeof]) {
	markBuiltinReference(expression, NO_EFFECTS);
}
for (const expression of [luau.globals.assert, luau.globals.error, luau.globals.select]) {
	markBuiltinReference(expression, MAY_THROW);
}
for (const expression of [luau.globals.next, luau.globals.table.unpack, luau.globals.unpack]) {
	markBuiltinReference(expression, READ_HEAP);
}
for (const expression of [
	luau.globals.table.insert,
	luau.globals.table.remove,
	luau.globals.table.clear,
	luau.globals.table.move,
]) {
	markBuiltinReference(expression, WRITE_HEAP);
}
for (const expression of [luau.globals.table.create, luau.globals.table.pack]) {
	markBuiltinReference(expression, { ...MAY_THROW, allocates: true });
}
markBuiltinReference(luau.globals.table.concat, READ_HEAP);
// the function lookup is stable, but searching can invoke user equality code.
markConstantReference(luau.globals.table.find);
// stable lookup does not imply a pure call (e.g. gsub can invoke a callback).
for (const expression of Object.values(luau.globals.string)) {
	markConstantReference(expression);
}
markBuiltinReference(luau.globals.string.split, { ...MAY_THROW, allocates: true });
for (const expression of [
	luau.globals.string.byte,
	luau.globals.string.find,
	luau.globals.string.lower,
	luau.globals.string.match,
	luau.globals.string.rep,
	luau.globals.string.reverse,
	luau.globals.string.sub,
	luau.globals.string.upper,
]) {
	markBuiltinReference(expression, MAY_THROW);
}

/** direct effect, excluding child evaluation. Unknown syntax fails closed. */
export function getIntrinsicEffects(node: luau.Node): EvaluationEffects {
	if (luau.isAnyIdentifier(node)) {
		return { ...NO_EFFECTS, reads: new Set([getBinding(node)]) };
	}
	if (luau.isSimplePrimitive(node) || luau.isNone(node) || luau.isVarArgsLiteral(node)) {
		return NO_EFFECTS;
	}
	if (luau.isCallExpression(node)) {
		return getBuiltinCallEffects(node.expression) ?? getCallEffects(node.expression) ?? UNKNOWN_EFFECTS;
	}
	if (luau.isMethodCallExpression(node)) {
		return UNKNOWN_EFFECTS;
	}
	if (luau.isTable(node)) {
		return luau.isSet(node) ? { ...ALLOCATION, throws: true } : ALLOCATION;
	}
	if (luau.isMapField(node)) {
		return luau.isStringLiteral(node.index) ||
			(luau.isNumberLiteral(node.index) && Number.isFinite(Number(node.index.value)))
			? NO_EFFECTS
			: MAY_THROW;
	}
	if (luau.isPropertyAccessExpression(node) || luau.isComputedIndexExpression(node)) {
		return isStableLookup(node) ? NO_EFFECTS : UNKNOWN_EFFECTS;
	}
	if (luau.isInterpolatedString(node)) {
		return luau.list.every(node.parts, part => luau.isInterpolatedStringPart(part) || isPrimitiveValue(part))
			? NO_EFFECTS
			: UNKNOWN_EFFECTS;
	}
	if (luau.isUnaryExpression(node)) {
		return node.operator === "#" && !isPrimitiveValue(node.expression) ? UNKNOWN_EFFECTS : NO_EFFECTS;
	}
	if (luau.isBinaryExpression(node)) {
		if (
			(node.operator === "==" || node.operator === "~=") &&
			!isPrimitiveValue(node.left) &&
			!isPrimitiveValue(node.right)
		) {
			return UNKNOWN_EFFECTS;
		}
		return NO_EFFECTS;
	}
	if (luau.isParenthesizedExpression(node) || luau.isIfExpression(node)) {
		return NO_EFFECTS;
	}
	if (luau.isAssignment(node) || luau.isVariableDeclaration(node)) {
		const targets = luau.list.isList(node.left) ? luau.list.toArray(node.left) : [node.left];
		// property writes can invoke __newindex or immediate Instance signal handlers
		return joinEffects(
			...targets.map(target =>
				luau.isAnyIdentifier(target)
					? { ...NO_EFFECTS, writes: new Set([getBinding(target)]) }
					: UNKNOWN_EFFECTS,
			),
		);
	}
	if (luau.isForStatement(node)) {
		// generalized iteration can call __iter
		return UNKNOWN_EFFECTS;
	}
	if (luau.isWhileStatement(node) || luau.isRepeatStatement(node)) {
		// moving an operand into a nonterminating loop can prevent its evaluation
		return UNKNOWN_EFFECTS;
	}
	if (luau.isNumericForStatement(node)) {
		// non-finite bounds can fail to terminate
		return MAY_THROW;
	}
	if (
		luau.isCallStatement(node) ||
		luau.isReturnStatement(node) ||
		luau.isIfStatement(node) ||
		luau.isDoStatement(node) ||
		luau.isComment(node) ||
		luau.isBreakStatement(node) ||
		luau.isContinueStatement(node) ||
		luau.isInterpolatedStringPart(node)
	) {
		return NO_EFFECTS;
	}
	return UNKNOWN_EFFECTS;
}

// field order is sufficient for effect summaries, but not for evaluation planning
export function getChildren(node: luau.Node): Array<luau.Node> {
	const result = new Array<luau.Node>();
	for (const [key, value] of Object.entries(node)) {
		if (key === "parent") {
			continue;
		}
		if (luau.isNode(value)) {
			result.push(value);
		} else if (luau.list.isList(value)) {
			luau.list.forEach(value, child => result.push(child));
		}
	}
	return result;
}

export function getEffects(node: luau.Node | luau.List<luau.Statement>): EvaluationEffects {
	if (luau.list.isList(node)) {
		return joinEffects(...luau.list.toArray(node).map(getEffects));
	}
	if (isConstantReference(node)) {
		return NO_EFFECTS;
	}
	// creating a closure does not execute its body.
	if (luau.isFunctionExpression(node)) {
		return ALLOCATION;
	}
	return joinEffects(getIntrinsicEffects(node), ...getChildren(node).map(getEffects));
}

/** luau can use a local's register directly until the consuming instruction. */
export function isLateRead(expression: luau.Expression): boolean {
	while (luau.isParenthesizedExpression(expression)) {
		expression = expression.expression;
	}
	return luau.isAnyIdentifier(expression);
}

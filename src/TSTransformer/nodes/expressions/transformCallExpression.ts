import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformImportExpression } from "TSTransformer/nodes/expressions/transformImportExpression";
import { transformMacroCall } from "TSTransformer/nodes/transformMacroCall";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isStableBuiltinMember, tryMarkBuiltinMember } from "TSTransformer/util/evaluation/builtins";
import { effectsCommute, getEffects, isLateRead, joinEffects, NO_EFFECTS } from "TSTransformer/util/evaluation/effects";
import { isMethod } from "TSTransformer/util/isMethod";
import { getFirstDefinedSymbol, isPossiblyType, isRobloxType, isUndefinedType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { wrapReturnIfLuaTuple } from "TSTransformer/util/wrapReturnIfLuaTuple";
import ts from "typescript";

// native functions can distinguish a missing argument from nil; parentheses
// force a possibly-empty return to supply exactly one value
function fixVoidArgumentsForRobloxFunctions(
	state: TransformState,
	type: ts.Type,
	args: Array<luau.Expression>,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	if (isPossiblyType(type, isRobloxType(state))) {
		for (let i = 0; i < args.length; i++) {
			const arg = args[i];
			const nodeArg = nodeArguments[i];
			if (ts.isCallExpression(nodeArg) && isPossiblyType(state.getType(nodeArg), isUndefinedType)) {
				args[i] = luau.create(luau.SyntaxKind.ParenthesizedExpression, {
					expression: arg,
				});
			}
		}
	}
}

export function transformCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	if (ts.isImportCall(node)) {
		return transformImportExpression(state, node);
	}

	// a in a()
	validateNotAnyType(state, node.expression);

	if (ts.isSuperCall(node)) {
		return luau.call(luau.property(convertToIndexableExpression(expression), "constructor"), [
			luau.globals.self,
			...ensureTransformOrder(state, node.arguments),
		]);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		const macro = state.services.macroManager.getCallMacro(symbol);
		if (macro) {
			return transformMacroCall(macro, state, node, expression, nodeArguments);
		}
	}

	const [args, prereqs] = state.capture(() => ensureTransformOrder(state, nodeArguments));
	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);

	if (!effectsCommute(getEffects(expression), getEffects(prereqs))) {
		expression = state.pushToVar(expression, "fn");
	}
	state.prereqList(prereqs);

	const exp = luau.call(convertToIndexableExpression(expression), args);

	return wrapReturnIfLuaTuple(state, node, exp);
}

function createOrderedPropertyCall(
	state: TransformState,
	source: ts.PropertyAccessExpression | ts.ElementAccessExpression,
	base: luau.Expression,
	key: string | luau.Expression,
	args: Array<luau.Expression>,
	prereqs: luau.List<luau.Statement>,
	method: boolean,
) {
	const property = () => {
		const expression =
			typeof key === "string"
				? luau.property(convertToIndexableExpression(base), key)
				: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(base),
						index: key,
					});
		tryMarkBuiltinMember(state, source, expression);
		return expression;
	};
	const prereqEffects = getEffects(prereqs);
	const name = typeof key === "string" ? key : luau.isStringLiteral(key) ? key.value : undefined;
	const stableMethod = method && isStableBuiltinMember(state, source);
	let callee: luau.IndexableExpression = property();
	const lookupEffects = getEffects(callee);
	const captureCallee = !effectsCommute(lookupEffects, prereqEffects);
	if (
		method &&
		name !== undefined &&
		luau.isValidIdentifier(name) &&
		(stableMethod || (!captureCallee && typeof key === "string"))
	) {
		// a stable method lookup can stay inline even when its receiver needs a snapshot
		if (stableMethod && !effectsCommute(getEffects(base), prereqEffects)) {
			base = state.pushToVar(base, "self");
		}
		state.prereqList(prereqs);
		return luau.create(luau.SyntaxKind.MethodCallExpression, {
			expression: convertToIndexableExpression(base),
			name,
			args: luau.list.make(...args),
		});
	}
	// an explicit self argument must denote the receiver from before the lookup
	if (
		method &&
		(!luau.isSimple(base) || !effectsCommute(getEffects(base), joinEffects(lookupEffects, prereqEffects)))
	) {
		base = state.pushToVar(base, "self");
		callee = property();
	}
	if (captureCallee) {
		callee = state.pushToVar(callee, "fn");
	}
	state.prereqList(prereqs);
	return luau.call(callee, method ? [base, ...args] : args);
}

export function transformPropertyCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: ts.PropertyAccessExpression,
	baseExpression: luau.Expression,
	name: string,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	// a in a.b()
	validateNotAnyType(state, expression.expression);
	// a.b in a.b()
	validateNotAnyType(state, node.expression);

	if (ts.isSuperProperty(expression)) {
		return luau.call(luau.property(convertToIndexableExpression(baseExpression), expression.name.text), [
			luau.globals.self,
			...ensureTransformOrder(state, node.arguments),
		]);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		const macro = state.services.macroManager.getPropertyCallMacro(symbol);
		if (macro) {
			return transformMacroCall(macro, state, node, baseExpression, nodeArguments);
		}
	}

	const [args, prereqs] = state.capture(() => ensureTransformOrder(state, nodeArguments));
	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);

	const exp = createOrderedPropertyCall(
		state,
		expression,
		baseExpression,
		name,
		args,
		prereqs,
		isMethod(state, expression),
	);
	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformElementCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: ts.ElementAccessExpression,
	baseExpression: luau.Expression,
	argumentExpression: ts.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	// a in a[b]()
	validateNotAnyType(state, expression.expression);
	// b in a[b]()
	validateNotAnyType(state, expression.argumentExpression);
	// a[b] in a[b]()
	validateNotAnyType(state, node.expression);

	if (ts.isSuperProperty(expression)) {
		return luau.call(
			luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(baseExpression),
				index: transformExpression(state, expression.argumentExpression),
			}),
			[luau.globals.self, ...ensureTransformOrder(state, node.arguments)],
		);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		const macro = state.services.macroManager.getPropertyCallMacro(symbol);
		if (macro) {
			return transformMacroCall(macro, state, node, baseExpression, nodeArguments);
		}
	}

	const [argumentExp, keyPrereqs] = state.capture(() => transformExpression(state, argumentExpression));
	if (
		!effectsCommute(
			getEffects(baseExpression),
			joinEffects(getEffects(keyPrereqs), isLateRead(baseExpression) ? getEffects(argumentExp) : NO_EFFECTS),
		)
	) {
		baseExpression = state.pushToVar(baseExpression, "exp");
	}
	state.prereqList(keyPrereqs);
	const [args, prereqs] = state.capture(() => ensureTransformOrder(state, nodeArguments));
	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);
	const key = addOneIfArrayType(
		state,
		state.typeChecker.getNonOptionalType(state.getType(expression.expression)),
		argumentExp,
	);
	const exp = createOrderedPropertyCall(
		state,
		expression,
		baseExpression,
		key,
		args,
		prereqs,
		isMethod(state, expression),
	);
	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	return transformOptionalChain(state, node);
}

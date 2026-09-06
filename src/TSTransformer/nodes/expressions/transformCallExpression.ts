import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { CallMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformImportExpression } from "TSTransformer/nodes/expressions/transformImportExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
import { isMethod } from "TSTransformer/util/isMethod";
import { getFirstDefinedSymbol, isPossiblyType, isRobloxType, isUndefinedType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import { wrapReturnIfLuaTuple } from "TSTransformer/util/wrapReturnIfLuaTuple";
import ts from "typescript";

function runCallMacro(
	macro: CallMacro | PropertyCallMacro,
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
): luau.Expression {
	let args!: Array<luau.Expression>;
	let varArg: luau.Expression | undefined;
	const prereqs = state.capturePrereqs(() => {
		const tsArgs = [...nodeArguments];

		const lastArg = tsArgs[tsArgs.length - 1];
		if (lastArg && ts.isSpreadElement(lastArg)) {
			// unwrap spread element
			tsArgs.pop();
			tsArgs.push(lastArg.expression);
			const transformed = ensureTransformOrder(state, tsArgs);
			varArg = transformed.pop();
			args = transformed;
		} else {
			args = ensureTransformOrder(state, tsArgs);
		}

		if (
			varArg &&
			lastArg &&
			ts.isSpreadElement(lastArg) &&
			state.typeChecker.isTupleType(state.getType(lastArg.expression))
		) {
			const tupleArgType = state.getType(lastArg.expression);
			const argumentCount = (tupleArgType as ts.TupleTypeReference).target.elementFlags.length;

			const spread = luau.call(luau.globals.unpack, [varArg]);
			varArg = undefined;
			const tempIds = luau.list.make<luau.TemporaryIdentifier>();
			for (let i = args.length; i < argumentCount; i++) {
				const tempId = luau.tempId(`spread${i}`);
				args.push(tempId);
				luau.list.push(tempIds, tempId);
			}
			state.prereq(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: tempIds,
					right: spread,
				}),
			);
		}

		for (let i = 0; i < args.length; i++) {
			if (expressionMightMutate(state, args[i], nodeArguments[i])) {
				args[i] = state.pushToVar(args[i], valueToIdStr(args[i]) || `arg${i}`);
			}
		}
	});

	let nodeExpression = node.expression;
	if (ts.isPropertyAccessExpression(nodeExpression) || ts.isElementAccessExpression(nodeExpression)) {
		nodeExpression = nodeExpression.expression;
	}

	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, expression, nodeExpression)) {
		expression = state.pushToVar(expression, valueToIdStr(expression) || "exp");
	}
	state.prereqList(prereqs);

	return wrapReturnIfLuaTuple(state, node, macro(state, node as never, expression, args, varArg));
}

/**
 * Some C functions like `tonumber()` will error if the given argument is a function that returns nothing.
 * i.e.
 * ```lua
 * local function foo()
 * end
 * local x = tonumber(foo()) -- error!
 * ```
 *
 * To protect against this, we can wrap possibly-undefined arguments with `()` to coerce the values to `nil`
 */
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
			return runCallMacro(macro, state, node, expression, nodeArguments);
		}
	}

	const [args, prereqs] = state.capture(() => ensureTransformOrder(state, nodeArguments));
	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);

	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, expression, node.expression)) {
		expression = state.pushToVar(expression, "fn");
	}
	state.prereqList(prereqs);

	const exp = luau.call(convertToIndexableExpression(expression), args);

	return wrapReturnIfLuaTuple(state, node, exp);
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
			return runCallMacro(macro, state, node, baseExpression, nodeArguments);
		}
	}

	const [args, prereqs] = state.capture(() => ensureTransformOrder(state, nodeArguments));
	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);

	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, baseExpression, expression.expression)) {
		baseExpression = state.pushToVar(baseExpression);
	}
	state.prereqList(prereqs);

	let exp: luau.Expression;
	if (isMethod(state, expression)) {
		// check that the name isn't a Luau keyword
		// if it is, we need to use PropertyAccessExpression and manually add the self argument
		if (luau.isValidIdentifier(name)) {
			exp = luau.create(luau.SyntaxKind.MethodCallExpression, {
				name,
				expression: convertToIndexableExpression(baseExpression),
				args: luau.list.make(...args),
			});
		} else {
			baseExpression = state.pushToVarIfComplex(baseExpression);
			args.unshift(baseExpression);
			exp = luau.call(luau.property(convertToIndexableExpression(baseExpression), name), args);
		}
	} else {
		// PropertyAccessExpression will wrap the identifier for us if necessary
		exp = luau.call(luau.property(convertToIndexableExpression(baseExpression), name), args);
	}

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
			return runCallMacro(macro, state, node, baseExpression, nodeArguments);
		}
	}

	const [[argumentExp, ...args], prereqs] = state.capture(() =>
		ensureTransformOrder(state, [argumentExpression, ...nodeArguments]),
	);

	fixVoidArgumentsForRobloxFunctions(state, expType, args, nodeArguments);

	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, baseExpression, expression.expression)) {
		baseExpression = state.pushToVar(baseExpression);
	}
	state.prereqList(prereqs);

	if (isMethod(state, expression)) {
		baseExpression = state.pushToVarIfComplex(baseExpression);
		args.unshift(baseExpression);
	}

	const exp = luau.call(
		luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(baseExpression),
			index: addOneIfArrayType(
				state,
				state.typeChecker.getNonOptionalType(state.getType(expression.expression)),
				argumentExp,
			),
		}),
		args,
	);

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	return transformOptionalChain(state, node);
}

import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformImportExpression } from "TSTransformer/nodes/expressions/transformImportExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
import { isMethod } from "TSTransformer/util/isMethod";
import { isSymbolFromRobloxTypes } from "TSTransformer/util/isSymbolFromRobloxTypes";
import { getFirstDefinedSymbol, isPossiblyType, isUndefinedType } from "TSTransformer/util/types";
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
	const prereqs = state.capturePrereqs(() => {
		args = ensureTransformOrder(state, nodeArguments);
		const lastArg = nodeArguments[nodeArguments.length - 1];
		if (lastArg && ts.isSpreadElement(lastArg)) {
			const signature = state.typeChecker.getSignaturesOfType(
				state.getType(node.expression),
				ts.SignatureKind.Call,
			)[0];

			const lastParameter = signature.parameters[signature.parameters.length - 1].valueDeclaration;
			if (lastParameter && ts.isParameter(lastParameter) && lastParameter.dotDotDotToken) {
				DiagnosticService.addDiagnostic(errors.noVarArgsMacroSpread(lastArg));
				return;
			}

			const minArgumentCount = signature.minArgumentCount;
			const spread = args.pop();
			const tempIds = luau.list.make<luau.TemporaryIdentifier>();
			for (let i = args.length; i < minArgumentCount; i++) {
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

	return wrapReturnIfLuaTuple(state, node, macro(state, node as never, expression, args));
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
	symbol: ts.Symbol | undefined,
	args: Array<luau.Expression>,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	if (isSymbolFromRobloxTypes(state, symbol)) {
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
	fixVoidArgumentsForRobloxFunctions(state, symbol, args, nodeArguments);

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
	fixVoidArgumentsForRobloxFunctions(state, symbol, args, nodeArguments);

	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, baseExpression, node.expression)) {
		baseExpression = state.pushToVar(baseExpression, "fn");
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
			baseExpression = state.pushToVarIfComplex(baseExpression, "fn");
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

	fixVoidArgumentsForRobloxFunctions(state, symbol, args, nodeArguments);

	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, baseExpression, node.expression)) {
		baseExpression = state.pushToVar(baseExpression, "fn");
	}
	state.prereqList(prereqs);

	if (isMethod(state, expression)) {
		baseExpression = state.pushToVarIfComplex(baseExpression, "fn");
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

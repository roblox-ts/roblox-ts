import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformOptionalChain } from "TSTransformer/nodes/optionalChain";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isMethod } from "TSTransformer/util/isMethod";
import { pushToVarIfComplex } from "TSTransformer/util/pushToVar";

export function transformCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: lua.IndexableExpression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const macro = state.macroManager.getCallMacro(state.typeChecker.getTypeAtLocation(node.expression).symbol);
	if (macro) {
		return macro(state, node, expression);
	}

	const args = lua.list.make(...ensureTransformOrder(state, nodeArguments));
	return lua.create(lua.SyntaxKind.CallExpression, { expression, args });
}

export function transformPropertyCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression },
	expression: lua.IndexableExpression,
	name: string,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const macro = state.macroManager.getPropertyCallMacro(state.typeChecker.getTypeAtLocation(node.expression).symbol);
	if (macro) {
		return macro(state, node, expression);
	}

	const args = lua.list.make(...ensureTransformOrder(state, nodeArguments));
	if (isMethod(state, node.expression)) {
		return lua.create(lua.SyntaxKind.MethodCallExpression, {
			name,
			expression,
			args,
		});
	} else {
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression,
				name,
			}),
			args,
		});
	}
}

export function transformElementCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression & { expression: ts.ElementAccessExpression },
	expression: lua.IndexableExpression,
	argumentExpression: ts.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const macro = state.macroManager.getPropertyCallMacro(state.typeChecker.getTypeAtLocation(node.expression).symbol);
	if (macro) {
		return macro(state, node, expression);
	}

	const args = lua.list.make(...ensureTransformOrder(state, [argumentExpression, ...nodeArguments]));
	const argumentExp = lua.list.shift(args)!;

	if (isMethod(state, node.expression)) {
		const selfId = pushToVarIfComplex(state, expression);
		lua.list.unshift(args, selfId);
	}

	return lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression,
			index: argumentExp,
		}),
		args,
	});
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	return transformOptionalChain(state, node);
}

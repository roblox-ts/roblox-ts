import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isMethod } from "TSTransformer/util/isMethod";
import { isLuaTupleType } from "TSTransformer/util/types";

function shouldWrapLuaTuple(node: ts.CallExpression, exp: lua.Expression) {
	if (!lua.isCall(exp)) {
		return true;
	}

	const parent = node.parent;

	// `const [a] = foo()`
	if (ts.isVariableDeclaration(parent) && ts.isArrayBindingPattern(parent.name)) {
		return false;
	}

	// `[a] = foo()`
	if (ts.isAssignmentExpression(parent) && ts.isArrayLiteralExpression(parent.left)) {
		return false;
	}

	// `foo()[n]`
	if (ts.isElementAccessExpression(parent)) {
		return false;
	}

	// `return foo()`
	if (ts.isReturnStatement(parent)) {
		return false;
	}

	return true;
}

function wrapReturnIfLuaTuple(state: TransformState, node: ts.CallExpression, exp: lua.Expression) {
	if (isLuaTupleType(state, state.getType(node)) && shouldWrapLuaTuple(node, exp)) {
		return lua.array([exp]);
	}
	return exp;
}

export function transformCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: lua.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const type = state.getType(node.expression);
	const macro = state.macroManager.getCallMacro(type.symbol);
	if (macro) {
		return macro(state, node, expression);
	}

	const args = lua.list.make(...ensureTransformOrder(state, nodeArguments));
	const exp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: convertToIndexableExpression(expression),
		args,
	});

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformPropertyCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression },
	expression: lua.Expression,
	name: string,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const type = state.getType(node.expression);
	const macro = state.macroManager.getPropertyCallMacro(type.symbol);
	if (macro) {
		return macro(state, node, expression);
	}

	const args = lua.list.make(...ensureTransformOrder(state, nodeArguments));
	let exp: lua.Expression;
	if (isMethod(state, node.expression)) {
		exp = lua.create(lua.SyntaxKind.MethodCallExpression, {
			name,
			expression: convertToIndexableExpression(expression),
			args,
		});
	} else {
		exp = lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: convertToIndexableExpression(expression),
				name,
			}),
			args,
		});
	}

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformElementCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression & { expression: ts.ElementAccessExpression },
	expression: lua.Expression,
	argumentExpression: ts.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	const type = state.getType(node.expression);
	const macro = state.macroManager.getPropertyCallMacro(type.symbol);
	if (macro) {
		return macro(state, node, expression);
	}

	const args = lua.list.make(...ensureTransformOrder(state, [argumentExpression, ...nodeArguments]));
	const argumentExp = lua.list.shift(args)!;

	if (isMethod(state, node.expression)) {
		const selfId = state.pushToVarIfComplex(expression);
		lua.list.unshift(args, selfId);
	}

	const exp = lua.create(lua.SyntaxKind.CallExpression, {
		expression: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: argumentExp,
		}),
		args,
	});

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	return transformOptionalChain(state, node);
}

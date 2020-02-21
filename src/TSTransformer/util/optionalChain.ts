import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import { TransformState } from "TSTransformer";
import { transformCallExpressionInner } from "TSTransformer/nodes/expressions/transformCallExpression";
import { transformElementAccessExpressionInner } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformPropertyAccessExpressionInner } from "TSTransformer/nodes/expressions/transformPropertyAccessExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import ts from "typescript";

enum OptionalChainItemKind {
	PropertyAccess,
	ElementAccess,
	Call,
}

interface OptionalChainItem {
	optional: boolean;
	type: ts.Type;
}

interface PropertyAccessItem extends OptionalChainItem {
	kind: OptionalChainItemKind.PropertyAccess;
	name: string;
}

interface ElementAccessItem extends OptionalChainItem {
	kind: OptionalChainItemKind.ElementAccess;
	expression: ts.Expression;
}

interface CallItem extends OptionalChainItem {
	kind: OptionalChainItemKind.Call;
	args: ReadonlyArray<ts.Expression>;
}

function createPropertyAccessItem(state: TransformState, node: ts.PropertyAccessExpression): PropertyAccessItem {
	return {
		kind: OptionalChainItemKind.PropertyAccess,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		name: node.name.text,
	};
}

function createElementAccessItem(state: TransformState, node: ts.ElementAccessExpression): ElementAccessItem {
	return {
		kind: OptionalChainItemKind.ElementAccess,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		expression: node.argumentExpression,
	};
}

function createCallItem(state: TransformState, node: ts.CallExpression): CallItem {
	return {
		kind: OptionalChainItemKind.Call,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		args: node.arguments,
	};
}

type ChainItem = PropertyAccessItem | ElementAccessItem | CallItem;

export function flattenOptionalChain(state: TransformState, expression: ts.Expression) {
	const chain = new Array<ChainItem>();
	while (true) {
		if (ts.isPropertyAccessExpression(expression)) {
			chain.unshift(createPropertyAccessItem(state, expression));
			expression = expression.expression;
		} else if (ts.isElementAccessExpression(expression)) {
			chain.unshift(createElementAccessItem(state, expression));
			expression = expression.expression;
		} else if (ts.isCallExpression(expression)) {
			chain.unshift(createCallItem(state, expression));
			expression = expression.expression;
		} else {
			break;
		}
	}
	return { chain, expression };
}

function removeUndefined(type: tsst.SimpleType): tsst.SimpleType {
	if (type.kind === tsst.SimpleTypeKind.UNDEFINED) {
		return { kind: tsst.SimpleTypeKind.NEVER };
	} else if (type.kind === tsst.SimpleTypeKind.UNION) {
		const types = type.types.filter(v => v.kind !== tsst.SimpleTypeKind.UNDEFINED);
		if (types.length === 0) {
			throw "???";
		} else if (types.length === 1) {
			return types[0];
		} else {
			return {
				kind: tsst.SimpleTypeKind.UNION,
				types,
			};
		}
	} else {
		return type;
	}
}

function transformChainItem(state: TransformState, expression: lua.Expression, item: ChainItem) {
	if (item.kind === OptionalChainItemKind.Call) {
		return transformCallExpressionInner(state, convertToIndexableExpression(expression), item.args);
	} else if (item.kind === OptionalChainItemKind.PropertyAccess) {
		return transformPropertyAccessExpressionInner(state, convertToIndexableExpression(expression), item.name);
	} else {
		return transformElementAccessExpressionInner(state, convertToIndexableExpression(expression), item.expression);
	}
}

export function transformOptionalChain(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression,
): lua.Expression {
	const { chain, expression } = flattenOptionalChain(state, node);

	let result = transformExpression(state, expression);
	for (const item of chain) {
		result = transformChainItem(state, result, item);
	}

	return result;
}

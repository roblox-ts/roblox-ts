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
		// OptionalChainItemKind.ElementAccess
		return transformElementAccessExpressionInner(state, convertToIndexableExpression(expression), item.expression);
	}
}

function transformOptionalChainInner(
	state: TransformState,
	chain: Array<ChainItem>,
	expression: lua.Expression,
	tempId: lua.TemporaryIdentifier | undefined = undefined,
	index = 0,
): lua.Expression {
	if (index >= chain.length) return expression;
	const item = chain[index];
	if (item.optional) {
		if (tempId === undefined) {
			tempId = lua.tempId();
			state.prereq(
				lua.create(lua.SyntaxKind.VariableDeclaration, {
					left: tempId,
					right: expression,
				}),
			);
		} else {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: tempId,
					right: expression,
				}),
			);
		}

		const { expression: newValue, statements } = state.capturePrereqs(() =>
			transformOptionalChainInner(state, chain, transformChainItem(state, tempId!, item), tempId, index + 1),
		);

		if (lua.list.isEmpty(statements)) {
			lua.list.push(
				statements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: tempId,
					right: newValue,
				}),
			);
		}

		state.prereq(
			lua.create(lua.SyntaxKind.IfStatement, {
				condition: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: tempId,
					operator: lua.BinaryOperator.TildeEquals,
					right: lua.nil(),
				}),
				statements,
				elseBody: lua.list.make(),
			}),
		);

		return tempId;
	} else {
		return transformOptionalChainInner(
			state,
			chain,
			transformChainItem(state, expression, item),
			tempId,
			index + 1,
		);
	}
}

export function transformOptionalChain(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression,
): lua.Expression {
	const { chain, expression } = flattenOptionalChain(state, node);
	return transformOptionalChainInner(state, chain, transformExpression(state, expression));
}

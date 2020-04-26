import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import {
	transformCallExpressionInner,
	transformPropertyCallExpressionInner,
} from "TSTransformer/nodes/expressions/transformCallExpression";
import { transformElementAccessExpressionInner } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformPropertyAccessExpressionInner } from "TSTransformer/nodes/expressions/transformPropertyAccessExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import ts from "typescript";
import { TemporaryIdentifier } from "LuaAST";

enum OptionalChainItemKind {
	PropertyAccess,
	ElementAccess,
	Call,
	PropertyCall,
}

interface OptionalChainItem {
	optional: boolean;
	type: ts.Type;
}

interface PropertyAccessItem extends OptionalChainItem {
	node: ts.PropertyAccessExpression;
	kind: OptionalChainItemKind.PropertyAccess;
	name: string;
}

interface ElementAccessItem extends OptionalChainItem {
	node: ts.ElementAccessExpression;
	kind: OptionalChainItemKind.ElementAccess;
	expression: ts.Expression;
}

interface CallItem extends OptionalChainItem {
	node: ts.CallExpression;
	kind: OptionalChainItemKind.Call;
	args: ReadonlyArray<ts.Expression>;
}

interface PropertyCallItem extends OptionalChainItem {
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression };
	kind: OptionalChainItemKind.PropertyCall;
	name: string;
	callOptional: boolean;
	callType: ts.Type;
	args: ReadonlyArray<ts.Expression>;
}

function createPropertyAccessItem(state: TransformState, node: ts.PropertyAccessExpression): PropertyAccessItem {
	return {
		node,
		kind: OptionalChainItemKind.PropertyAccess,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		name: node.name.text,
	};
}

function createElementAccessItem(state: TransformState, node: ts.ElementAccessExpression): ElementAccessItem {
	return {
		node,
		kind: OptionalChainItemKind.ElementAccess,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		expression: node.argumentExpression,
	};
}

function createCallItem(state: TransformState, node: ts.CallExpression): CallItem {
	return {
		node,
		kind: OptionalChainItemKind.Call,
		optional: node.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		args: node.arguments,
	};
}

function createPropertyCallItem(
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression },
): PropertyCallItem {
	return {
		node,
		kind: OptionalChainItemKind.PropertyCall,
		optional: node.expression.questionDotToken !== undefined,
		type: state.typeChecker.getTypeAtLocation(node.expression),
		name: node.expression.name.text,
		callType: state.typeChecker.getTypeAtLocation(node),
		callOptional: node.questionDotToken !== undefined,
		args: node.arguments,
	};
}

type ChainItem = PropertyAccessItem | ElementAccessItem | CallItem | PropertyCallItem;

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
			// this is a bit of a mess..
			const subExp = expression.expression;
			if (ts.isPropertyAccessExpression(subExp)) {
				chain.unshift(
					createPropertyCallItem(
						state,
						expression as ts.CallExpression & { expression: ts.PropertyAccessExpression },
					),
				);
				expression = subExp.expression;
			} else {
				chain.unshift(createCallItem(state, expression));
				expression = subExp;
			}
		} else {
			break;
		}
	}
	return { chain, expression };
}

function transformChainItem(state: TransformState, expression: lua.Expression, item: ChainItem) {
	const indexableExpression = convertToIndexableExpression(expression);
	if (item.kind === OptionalChainItemKind.PropertyAccess) {
		return transformPropertyAccessExpressionInner(state, indexableExpression, item.name);
	} else if (item.kind === OptionalChainItemKind.ElementAccess) {
		return transformElementAccessExpressionInner(state, indexableExpression, item.expression);
	} else if (item.kind === OptionalChainItemKind.Call) {
		return transformCallExpressionInner(state, indexableExpression, item.args);
	} else if (item.kind === OptionalChainItemKind.PropertyCall) {
		return transformPropertyCallExpressionInner(state, item.node, indexableExpression, item.name, item.args);
	}
	throw new Error("???");
}

function createOrSetTempId(
	state: TransformState,
	tempId: lua.TemporaryIdentifier | undefined,
	expression: lua.Expression,
) {
	if (tempId === undefined) {
		tempId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: tempId,
				right: expression,
			}),
		);
	} else {
		if (tempId !== expression) {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: tempId,
					right: expression,
				}),
			);
		}
	}
	return tempId;
}

function createNilCheck(tempId: TemporaryIdentifier, statements: lua.List<lua.Statement>) {
	return lua.create(lua.SyntaxKind.IfStatement, {
		condition: lua.create(lua.SyntaxKind.BinaryExpression, {
			left: tempId,
			operator: "~=",
			right: lua.nil(),
		}),
		statements,
		elseBody: lua.list.make(),
	});
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
	if (item.optional || (item.kind === OptionalChainItemKind.PropertyCall && item.callOptional)) {
		let isMethod = false;
		let selfParam: lua.TemporaryIdentifier | undefined;

		if (item.kind === OptionalChainItemKind.PropertyCall) {
			isMethod = true; // TODO: solve isMethod
			if (item.callOptional && isMethod) {
				selfParam = lua.tempId();
				state.prereq(
					lua.create(lua.SyntaxKind.VariableDeclaration, {
						left: selfParam,
						right: expression,
					}),
				);
				expression = selfParam;
			}

			if (item.optional) {
				tempId = createOrSetTempId(state, tempId, expression);
				expression = tempId;
			}

			if (item.callOptional) {
				expression = lua.create(lua.SyntaxKind.PropertyAccessExpression, {
					expression: convertToIndexableExpression(expression),
					name: item.name,
				});
			}
		}

		// capture so we can wrap later if necessary
		const { statements, expression: result } = state.capturePrereqs(() => {
			tempId = createOrSetTempId(state, tempId, expression);

			let newExpression: lua.Expression;
			if (item.kind === OptionalChainItemKind.PropertyCall && item.callOptional) {
				// TODO: assert not macro
				const args = lua.list.make(...ensureTransformOrder(state, item.args));
				if (isMethod) {
					lua.list.unshift(args, selfParam!);
				}
				newExpression = lua.create(lua.SyntaxKind.CallExpression, {
					expression: tempId,
					args,
				});
			} else {
				newExpression = transformChainItem(state, tempId, item);
			}

			const { expression: newValue, statements } = state.capturePrereqs(() =>
				transformOptionalChainInner(state, chain, newExpression, tempId, index + 1),
			);

			if (tempId !== newValue) {
				lua.list.push(
					statements,
					lua.create(lua.SyntaxKind.Assignment, {
						left: tempId,
						right: newValue,
					}),
				);
			}

			state.prereq(createNilCheck(tempId, statements));

			return tempId;
		});

		if (item.kind === OptionalChainItemKind.PropertyCall && item.optional && item.callOptional) {
			state.prereq(createNilCheck(tempId!, statements));
		} else {
			state.prereqList(statements);
		}

		return result;
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

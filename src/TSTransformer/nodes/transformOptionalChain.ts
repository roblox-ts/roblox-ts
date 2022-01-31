import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import {
	transformCallExpressionInner,
	transformElementCallExpressionInner,
	transformPropertyCallExpressionInner,
} from "TSTransformer/nodes/expressions/transformCallExpression";
import { transformElementAccessExpressionInner } from "TSTransformer/nodes/expressions/transformElementAccessExpression";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformPropertyAccessExpressionInner } from "TSTransformer/nodes/expressions/transformPropertyAccessExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isMethod } from "TSTransformer/util/isMethod";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { skipDownwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import { wrapReturnIfLuaTuple } from "TSTransformer/util/wrapReturnIfLuaTuple";
import ts from "typescript";

enum OptionalChainItemKind {
	PropertyAccess,
	ElementAccess,
	Call,
	PropertyCall,
	ElementCall,
}

interface OptionalChainItem<T extends OptionalChainItemKind, U extends ts.Expression> {
	kind: T;
	node: U;
	optional: boolean;
	type: ts.Type;
}

interface PropertyAccessItem
	extends OptionalChainItem<OptionalChainItemKind.PropertyAccess, ts.PropertyAccessExpression> {
	name: string;
}

interface ElementAccessItem extends OptionalChainItem<OptionalChainItemKind.ElementAccess, ts.ElementAccessExpression> {
	expression: ts.Expression;
}

interface CallItem extends OptionalChainItem<OptionalChainItemKind.Call, ts.CallExpression> {
	args: ReadonlyArray<ts.Expression>;
}

interface PropertyCallItem extends OptionalChainItem<OptionalChainItemKind.PropertyCall, ts.CallExpression> {
	expression: ts.PropertyAccessExpression;
	name: string;
	callOptional: boolean;
	callType: ts.Type;
	args: ReadonlyArray<ts.Expression>;
}

interface ElementCallItem extends OptionalChainItem<OptionalChainItemKind.ElementCall, ts.CallExpression> {
	expression: ts.ElementAccessExpression;
	argumentExpression: ts.Expression;
	callOptional: boolean;
	callType: ts.Type;
	args: ReadonlyArray<ts.Expression>;
}

function createPropertyAccessItem(state: TransformState, node: ts.PropertyAccessExpression): PropertyAccessItem {
	return {
		node,
		kind: OptionalChainItemKind.PropertyAccess,
		optional: node.questionDotToken !== undefined,
		type: state.getType(node.expression),
		name: node.name.text,
	};
}

function createElementAccessItem(state: TransformState, node: ts.ElementAccessExpression): ElementAccessItem {
	return {
		node,
		kind: OptionalChainItemKind.ElementAccess,
		optional: node.questionDotToken !== undefined,
		type: state.getType(node.expression),
		expression: node.argumentExpression,
	};
}

function createCallItem(state: TransformState, node: ts.CallExpression): CallItem {
	return {
		node,
		kind: OptionalChainItemKind.Call,
		optional: node.questionDotToken !== undefined,
		type: state.getType(node.expression),
		args: node.arguments,
	};
}

function createPropertyCallItem(
	state: TransformState,
	node: PropertyCallItem["node"],
	expression: PropertyCallItem["expression"],
): PropertyCallItem {
	return {
		node,
		expression,
		kind: OptionalChainItemKind.PropertyCall,
		optional: expression.questionDotToken !== undefined,
		type: state.getType(node.expression),
		name: expression.name.text,
		callType: state.getType(node),
		callOptional: node.questionDotToken !== undefined,
		args: node.arguments,
	};
}

function createElementCallItem(
	state: TransformState,
	node: ElementCallItem["node"],
	expression: ElementCallItem["expression"],
): ElementCallItem {
	return {
		node,
		expression,
		kind: OptionalChainItemKind.ElementCall,
		optional: expression.questionDotToken !== undefined,
		type: state.getType(expression),
		argumentExpression: expression.argumentExpression,
		callType: state.getType(node),
		callOptional: node.questionDotToken !== undefined,
		args: node.arguments,
	};
}

type ChainItem = PropertyAccessItem | ElementAccessItem | CallItem | PropertyCallItem | ElementCallItem;

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
			const subExp = skipDownwards(expression.expression);
			if (ts.isPropertyAccessExpression(subExp)) {
				chain.unshift(createPropertyCallItem(state, expression, subExp));
				expression = subExp.expression;
			} else if (ts.isElementAccessExpression(subExp)) {
				chain.unshift(createElementCallItem(state, expression, subExp));
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

function transformChainItem(state: TransformState, baseExpression: luau.Expression, item: ChainItem) {
	if (item.kind === OptionalChainItemKind.PropertyAccess) {
		return transformPropertyAccessExpressionInner(state, item.node, baseExpression, item.name);
	} else if (item.kind === OptionalChainItemKind.ElementAccess) {
		return transformElementAccessExpressionInner(state, item.node, baseExpression, item.expression);
	} else if (item.kind === OptionalChainItemKind.Call) {
		return transformCallExpressionInner(state, item.node, baseExpression, item.args);
	} else if (item.kind === OptionalChainItemKind.PropertyCall) {
		return transformPropertyCallExpressionInner(
			state,
			item.node,
			item.expression,
			baseExpression,
			item.name,
			item.args,
		);
	} else {
		return transformElementCallExpressionInner(
			state,
			item.node,
			item.expression,
			baseExpression,
			item.argumentExpression,
			item.args,
		);
	}
}

function createOrSetTempId(
	state: TransformState,
	tempId: luau.TemporaryIdentifier | undefined,
	expression: luau.Expression,
	node: ts.Node,
) {
	if (tempId === undefined) {
		tempId = state.pushToVar(
			expression,
			node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)
				? node.parent.name.text
				: "result",
		);
	} else {
		if (tempId !== expression) {
			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: tempId,
					operator: "=",
					right: expression,
				}),
			);
		}
	}
	return tempId;
}

function createNilCheck(tempId: luau.TemporaryIdentifier, statements: luau.List<luau.Statement>) {
	return luau.create(luau.SyntaxKind.IfStatement, {
		condition: luau.binary(tempId, "~=", luau.nil()),
		statements,
		elseBody: luau.list.make(),
	});
}

function isCompoundCall(item: ChainItem): item is PropertyCallItem | ElementCallItem {
	return item.kind === OptionalChainItemKind.PropertyCall || item.kind === OptionalChainItemKind.ElementCall;
}

function transformOptionalChainInner(
	state: TransformState,
	chain: Array<ChainItem>,
	baseExpression: luau.Expression,
	tempId: luau.TemporaryIdentifier | undefined = undefined,
	index = 0,
): luau.Expression {
	if (index >= chain.length) return baseExpression;
	const item = chain[index];
	if (item.optional || (isCompoundCall(item) && item.callOptional)) {
		let isMethodCall = false;
		let isSuperCall = false;
		let selfParam: luau.TemporaryIdentifier | undefined;

		if (isCompoundCall(item)) {
			isMethodCall = isMethod(state, item.expression);
			isSuperCall = ts.isSuperProperty(item.expression);
			if (item.callOptional && isMethodCall && !isSuperCall) {
				selfParam = state.pushToVar(baseExpression, "self");
				baseExpression = selfParam;
			}

			if (item.optional) {
				tempId = createOrSetTempId(state, tempId, baseExpression, chain[chain.length - 1].node);
				baseExpression = tempId;
			}

			if (item.callOptional) {
				if (item.kind === OptionalChainItemKind.PropertyCall) {
					baseExpression = luau.property(convertToIndexableExpression(baseExpression), item.name);
				} else {
					baseExpression = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(baseExpression),
						index: transformExpression(state, item.argumentExpression),
					});
				}
			}
		}

		// capture so we can wrap later if necessary
		const [result, prereqStatements] = state.capture(() => {
			tempId = createOrSetTempId(state, tempId, baseExpression, chain[chain.length - 1].node);

			const [newValue, ifStatements] = state.capture(() => {
				let newExpression: luau.Expression;
				if (isCompoundCall(item) && item.callOptional) {
					const expType = state.typeChecker.getNonNullableType(state.getType(item.node.expression));
					const symbol = getFirstDefinedSymbol(state, expType);
					if (symbol) {
						const macro = state.services.macroManager.getPropertyCallMacro(symbol);
						if (macro) {
							DiagnosticService.addDiagnostic(errors.noOptionalMacroCall(item.node));
							return luau.nil();
						}
					}

					const args = ensureTransformOrder(state, item.args);
					if (isMethodCall) {
						if (isSuperCall) {
							args.unshift(luau.globals.self);
						} else {
							args.unshift(selfParam!);
						}
					}
					newExpression = wrapReturnIfLuaTuple(state, item.node, luau.call(tempId!, args));
				} else {
					newExpression = transformChainItem(state, tempId!, item);
				}
				return transformOptionalChainInner(state, chain, newExpression, tempId, index + 1);
			});

			const isUsed = !luau.isNilLiteral(newValue) && !isUsedAsStatement(item.node);

			if (tempId !== newValue && isUsed) {
				luau.list.push(
					ifStatements,
					luau.create(luau.SyntaxKind.Assignment, {
						left: tempId,
						operator: "=",
						right: newValue,
					}),
				);
			} else {
				if (luau.isCall(newValue)) {
					luau.list.push(
						ifStatements,
						luau.create(luau.SyntaxKind.CallStatement, {
							expression: newValue,
						}),
					);
				}
			}

			state.prereq(createNilCheck(tempId, ifStatements));

			return isUsed ? tempId : luau.nil();
		});

		if (isCompoundCall(item) && item.optional && item.callOptional) {
			state.prereq(createNilCheck(tempId!, prereqStatements));
		} else {
			state.prereqList(prereqStatements);
		}

		return result;
	} else {
		return transformOptionalChainInner(
			state,
			chain,
			transformChainItem(state, baseExpression, item),
			tempId,
			index + 1,
		);
	}
}

export function transformOptionalChain(
	state: TransformState,
	node: ts.PropertyAccessExpression | ts.ElementAccessExpression | ts.CallExpression,
): luau.Expression {
	const { chain, expression } = flattenOptionalChain(state, node);
	return transformOptionalChainInner(state, chain, transformExpression(state, expression));
}

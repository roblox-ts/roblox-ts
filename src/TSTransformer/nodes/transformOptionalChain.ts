import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
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
import { getFirstDefinedSymbol } from "TSTransformer/util/types";

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

interface PropertyCallItem
	extends OptionalChainItem<
		OptionalChainItemKind.PropertyCall,
		ts.CallExpression & { expression: ts.PropertyAccessExpression }
	> {
	name: string;
	callOptional: boolean;
	callType: ts.Type;
	args: ReadonlyArray<ts.Expression>;
}

interface ElementCallItem
	extends OptionalChainItem<
		OptionalChainItemKind.ElementCall,
		ts.CallExpression & { expression: ts.ElementAccessExpression }
	> {
	expression: ts.Expression;
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

function createPropertyCallItem(state: TransformState, node: PropertyCallItem["node"]): PropertyCallItem {
	return {
		node,
		kind: OptionalChainItemKind.PropertyCall,
		optional: node.expression.questionDotToken !== undefined,
		type: state.getType(node.expression),
		name: node.expression.name.text,
		callType: state.getType(node),
		callOptional: node.questionDotToken !== undefined,
		args: node.arguments,
	};
}

function createElementCallItem(state: TransformState, node: ElementCallItem["node"]): ElementCallItem {
	return {
		node,
		kind: OptionalChainItemKind.ElementCall,
		optional: node.expression.questionDotToken !== undefined,
		type: state.getType(node.expression),
		expression: node.expression.argumentExpression,
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
			const subExp = expression.expression;
			if (ts.isPropertyAccessExpression(subExp)) {
				chain.unshift(createPropertyCallItem(state, expression as PropertyCallItem["node"]));
				expression = subExp.expression;
			} else if (ts.isElementAccessExpression(subExp)) {
				chain.unshift(createElementCallItem(state, expression as ElementCallItem["node"]));
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

function transformChainItem(state: TransformState, expression: luau.Expression, item: ChainItem) {
	if (item.kind === OptionalChainItemKind.PropertyAccess) {
		return transformPropertyAccessExpressionInner(state, item.node, expression, item.name);
	} else if (item.kind === OptionalChainItemKind.ElementAccess) {
		return transformElementAccessExpressionInner(state, item.node, expression, item.expression);
	} else if (item.kind === OptionalChainItemKind.Call) {
		return transformCallExpressionInner(state, item.node, expression, item.args);
	} else if (item.kind === OptionalChainItemKind.PropertyCall) {
		return transformPropertyCallExpressionInner(state, item.node, expression, item.name, item.args);
	} else {
		return transformElementCallExpressionInner(state, item.node, expression, item.expression, item.args);
	}
}

function createOrSetTempId(
	state: TransformState,
	tempId: luau.TemporaryIdentifier | undefined,
	expression: luau.Expression,
) {
	if (tempId === undefined) {
		tempId = state.pushToVar(expression);
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
	expression: luau.Expression,
	tempId: luau.TemporaryIdentifier | undefined = undefined,
	index = 0,
): luau.Expression {
	if (index >= chain.length) return expression;
	const item = chain[index];
	if (item.optional || (isCompoundCall(item) && item.callOptional)) {
		let isMethodCall = false;
		let selfParam: luau.TemporaryIdentifier | undefined;

		if (isCompoundCall(item)) {
			isMethodCall = isMethod(state, item.node.expression);
			if (item.callOptional && isMethodCall) {
				selfParam = state.pushToVar(expression);
				expression = selfParam;
			}

			if (item.optional) {
				tempId = createOrSetTempId(state, tempId, expression);
				expression = tempId;
			}

			if (item.callOptional) {
				if (item.kind === OptionalChainItemKind.PropertyCall) {
					expression = luau.create(luau.SyntaxKind.PropertyAccessExpression, {
						expression: convertToIndexableExpression(expression),
						name: item.name,
					});
				} else {
					expression = luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: convertToIndexableExpression(expression),
						index: transformExpression(state, item.expression),
					});
				}
			}
		}

		// capture so we can wrap later if necessary
		const [result, prereqStatements] = state.capture(() => {
			tempId = createOrSetTempId(state, tempId, expression);

			const [newValue, ifStatements] = state.capture(() => {
				let newExpression: luau.Expression;
				if (isCompoundCall(item) && item.callOptional) {
					const symbol = getFirstDefinedSymbol(state, state.getType(item.node.expression));
					if (symbol) {
						const macro = state.services.macroManager.getPropertyCallMacro(symbol);
						if (macro) {
							state.addDiagnostic(diagnostics.noOptionalMacroCall(item.node));
							return luau.emptyId();
						}
					}

					const args = luau.list.make(...ensureTransformOrder(state, item.args));
					if (isMethodCall) {
						luau.list.unshift(args, selfParam!);
					}
					newExpression = luau.create(luau.SyntaxKind.CallExpression, {
						expression: tempId!,
						args,
					});
				} else {
					newExpression = transformChainItem(state, tempId!, item);
				}
				return transformOptionalChainInner(state, chain, newExpression, tempId, index + 1);
			});

			const isUsed =
				!luau.isEmptyIdentifier(newValue) && !luau.isNilLiteral(newValue) && !isUsedAsStatement(item.node);

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

			return isUsed ? tempId : luau.emptyId();
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
			transformChainItem(state, expression, item),
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

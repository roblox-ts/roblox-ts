import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { isMethod } from "TSTransformer/util/isMethod";
import { getAncestor, skipUpwards } from "TSTransformer/util/traversal";
import { isLuaTupleType, isArrayType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";

function shouldWrapLuaTuple(node: ts.CallExpression, exp: lua.Expression) {
	if (!lua.isCall(exp)) {
		return true;
	}

	const parent = skipUpwards(node).parent;

	// `foo()`
	if (ts.isExpressionStatement(parent)) {
		return false;
	}

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
	validateNotAnyType(state, node.expression);
	for (const arg of node.arguments) {
		validateNotAnyType(state, arg);
	}

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
	validateNotAnyType(state, node.expression);
	for (const arg of node.arguments) {
		validateNotAnyType(state, arg);
	}

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
	validateNotAnyType(state, node.expression);
	for (const arg of node.arguments) {
		validateNotAnyType(state, arg);
	}

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
			index: addOneIfArrayType(state, state.getType(node.expression.expression), argumentExp),
		}),
		args,
	});

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	if (ts.isSuperCall(node) || ts.isSuperProperty(node.expression)) {
		for (const arg of node.arguments) {
			validateNotAnyType(state, arg);
		}

		const classLikeAncestor = getAncestor(node, ts.isClassLike);
		const insideRoactComponent = classLikeAncestor && extendsRoactComponent(state, classLikeAncestor);
		if (ts.isSuperCall(node)) {
			if (insideRoactComponent) {
				state.addDiagnostic(diagnostics.noSuperPropertyCallRoactComponent(node));
			}
			return lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
					expression: lua.globals.super,
					name: "constructor",
				}),
				args: lua.list.make(lua.globals.self, ...ensureTransformOrder(state, node.arguments)),
			});
		} else if (ts.isSuperProperty(node.expression)) {
			if (insideRoactComponent) {
				state.addDiagnostic(diagnostics.noSuperConstructorRoactComponent(node));
			}
			if (ts.isPropertyAccessExpression(node.expression)) {
				return lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
						expression: lua.globals.super,
						name: node.expression.name.text,
					}),
					args: lua.list.make(lua.globals.self, ...ensureTransformOrder(state, node.arguments)),
				});
			} else {
				return lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
						expression: lua.globals.super,
						index: transformExpression(state, node.expression.argumentExpression),
					}),
					args: lua.list.make(lua.globals.self, ...ensureTransformOrder(state, node.arguments)),
				});
			}
		}
	}

	return transformOptionalChain(state, node);
}

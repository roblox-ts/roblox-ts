import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { isMethod } from "TSTransformer/util/isMethod";
import { getAncestor, skipUpwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol, isLuaTupleType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

function shouldWrapLuaTuple(node: ts.CallExpression, exp: luau.Expression) {
	if (!luau.isCall(exp)) {
		return true;
	}

	const parent = skipUpwards(node).parent;

	// `foo()`
	if (ts.isExpressionStatement(parent) || ts.isForStatement(parent)) {
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

function wrapReturnIfLuaTuple(state: TransformState, node: ts.CallExpression, exp: luau.Expression) {
	if (isLuaTupleType(state, state.getType(node)) && shouldWrapLuaTuple(node, exp)) {
		return luau.array([exp]);
	}
	return exp;
}

export function transformCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	validateNotAnyType(state, node.expression);

	const symbol = getFirstDefinedSymbol(state, state.getType(node.expression));
	if (symbol) {
		const macro = state.services.macroManager.getCallMacro(symbol);
		if (macro) {
			return wrapReturnIfLuaTuple(state, node, macro(state, node, expression));
		}
	}

	const args = luau.list.make(...ensureTransformOrder(state, nodeArguments));
	const exp = luau.create(luau.SyntaxKind.CallExpression, {
		expression: convertToIndexableExpression(expression),
		args,
	});

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformPropertyCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression & { expression: ts.PropertyAccessExpression },
	expression: luau.Expression,
	name: string,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	validateNotAnyType(state, node.expression);

	const symbol = getFirstDefinedSymbol(state, state.getType(node.expression));
	if (symbol) {
		const macro = state.services.macroManager.getPropertyCallMacro(symbol);
		if (macro) {
			return wrapReturnIfLuaTuple(state, node, macro(state, node, expression));
		}
	}

	const args = luau.list.make(...ensureTransformOrder(state, nodeArguments));
	let exp: luau.Expression;
	if (isMethod(state, node.expression)) {
		if (isValidLuauIdentifier(name)) {
			exp = luau.create(luau.SyntaxKind.MethodCallExpression, {
				name,
				expression: convertToIndexableExpression(expression),
				args,
			});
		} else {
			expression = state.pushToVarIfComplex(expression);
			luau.list.unshift(args, expression);
			exp = luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
					expression: convertToIndexableExpression(expression),
					name,
				}),
				args,
			});
		}
	} else {
		exp = luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
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
	expression: luau.Expression,
	argumentExpression: ts.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	validateNotAnyType(state, node.expression);

	const symbol = getFirstDefinedSymbol(state, state.getType(node.expression));
	if (symbol) {
		const macro = state.services.macroManager.getPropertyCallMacro(symbol);
		if (macro) {
			return wrapReturnIfLuaTuple(state, node, macro(state, node, expression));
		}
	}

	const args = luau.list.make(...ensureTransformOrder(state, [argumentExpression, ...nodeArguments]));
	const argumentExp = luau.list.shift(args)!;

	if (isMethod(state, node.expression)) {
		expression = state.pushToVarIfComplex(expression);
		luau.list.unshift(args, expression);
	}

	const exp = luau.create(luau.SyntaxKind.CallExpression, {
		expression: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: addOneIfArrayType(state, state.getType(node.expression.expression), argumentExp),
		}),
		args,
	});

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	if (ts.isSuperCall(node) || ts.isSuperProperty(node.expression)) {
		const classLikeAncestor = getAncestor(node, ts.isClassLike);
		const insideRoactComponent = classLikeAncestor && extendsRoactComponent(state, classLikeAncestor);
		if (ts.isSuperCall(node)) {
			if (insideRoactComponent) {
				state.addDiagnostic(diagnostics.noSuperPropertyCallRoactComponent(node));
			}
			return luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
					expression: luau.globals.super,
					name: "constructor",
				}),
				args: luau.list.make(luau.globals.self, ...ensureTransformOrder(state, node.arguments)),
			});
		} else if (ts.isSuperProperty(node.expression)) {
			if (insideRoactComponent) {
				state.addDiagnostic(diagnostics.noSuperConstructorRoactComponent(node));
			}
			if (ts.isPropertyAccessExpression(node.expression)) {
				return luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
						expression: luau.globals.super,
						name: node.expression.name.text,
					}),
					args: luau.list.make(luau.globals.self, ...ensureTransformOrder(state, node.arguments)),
				});
			} else {
				return luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: luau.globals.super,
						index: transformExpression(state, node.expression.argumentExpression),
					}),
					args: luau.list.make(luau.globals.self, ...ensureTransformOrder(state, node.arguments)),
				});
			}
		}
	}

	return transformOptionalChain(state, node);
}

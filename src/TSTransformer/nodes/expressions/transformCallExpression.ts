import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { isValidLuauIdentifier } from "Shared/util/isValidLuauIdentifier";
import { TransformState } from "TSTransformer";
import { CallMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
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

	// `void foo()`
	if (ts.isVoidExpression(parent)) {
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
			const signatures = state.typeChecker.getSignaturesOfType(
				state.getType(node.expression),
				ts.SignatureKind.Call,
			);
			const minArgumentCount = signatures[0].minArgumentCount;
			const spread = args.pop();
			const tempIds = luau.list.make<luau.TemporaryIdentifier>();
			for (let i = args.length; i < minArgumentCount; i++) {
				const tempId = luau.tempId();
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
			if (expressionMightMutate(state, args[i])) {
				args[i] = state.pushToVar(args[i]);
			}
		}
	});

	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, expression, node.expression)) {
		expression = state.pushToVar(expression);
	}
	state.prereqList(prereqs);

	return wrapReturnIfLuaTuple(state, node, macro(state, node as never, expression, args));
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
			return runCallMacro(macro, state, node, expression, nodeArguments);
		}
	}

	let args!: Array<luau.Expression>;
	const prereqs = state.capturePrereqs(() => (args = ensureTransformOrder(state, nodeArguments)));
	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, expression, node.expression)) {
		expression = state.pushToVar(expression);
	}
	state.prereqList(prereqs);

	const exp = luau.call(convertToIndexableExpression(expression), args);

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
			return runCallMacro(macro, state, node, expression, nodeArguments);
		}
	}

	let args!: Array<luau.Expression>;
	const prereqs = state.capturePrereqs(() => (args = ensureTransformOrder(state, nodeArguments)));
	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, expression, node.expression)) {
		expression = state.pushToVar(expression);
	}
	state.prereqList(prereqs);

	let exp: luau.Expression;
	if (isMethod(state, node.expression)) {
		if (isValidLuauIdentifier(name)) {
			exp = luau.create(luau.SyntaxKind.MethodCallExpression, {
				name,
				expression: convertToIndexableExpression(expression),
				args: luau.list.make(...args),
			});
		} else {
			expression = state.pushToVarIfComplex(expression);
			args.unshift(expression);
			exp = luau.call(luau.property(convertToIndexableExpression(expression), name), args);
		}
	} else {
		exp = luau.call(luau.property(convertToIndexableExpression(expression), name), args);
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
			return runCallMacro(macro, state, node, expression, nodeArguments);
		}
	}

	let args!: Array<luau.Expression>;
	const prereqs = state.capturePrereqs(
		() => (args = ensureTransformOrder(state, [argumentExpression, ...nodeArguments])),
	);
	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, expression, node.expression)) {
		expression = state.pushToVar(expression);
	}
	state.prereqList(prereqs);

	const argumentExp = args.shift()!;

	if (isMethod(state, node.expression)) {
		expression = state.pushToVarIfComplex(expression);
		args.unshift(expression);
	}

	const exp = luau.call(
		luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(expression),
			index: addOneIfArrayType(state, state.getType(node.expression.expression), argumentExp),
		}),
		args,
	);

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
			return luau.call(luau.property(luau.globals.super, "constructor"), [
				luau.globals.self,
				...ensureTransformOrder(state, node.arguments),
			]);
		} else if (ts.isSuperProperty(node.expression)) {
			if (insideRoactComponent) {
				state.addDiagnostic(diagnostics.noSuperConstructorRoactComponent(node));
			}
			if (ts.isPropertyAccessExpression(node.expression)) {
				return luau.call(luau.property(luau.globals.super, node.expression.name.text), [
					luau.globals.self,
					...ensureTransformOrder(state, node.arguments),
				]);
			} else {
				return luau.call(
					luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: luau.globals.super,
						index: transformExpression(state, node.expression.argumentExpression),
					}),
					[luau.globals.self, ...ensureTransformOrder(state, node.arguments)],
				);
			}
		}
	}

	return transformOptionalChain(state, node);
}

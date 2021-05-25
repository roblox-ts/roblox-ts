import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, PropertyCallMacro } from "TSTransformer/macros/types";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformImportExpression } from "TSTransformer/nodes/expressions/transformImportExpression";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { addOneIfArrayType } from "TSTransformer/util/addOneIfArrayType";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
import { extendsRoactComponent } from "TSTransformer/util/extendsRoactComponent";
import { isMethod } from "TSTransformer/util/isMethod";
import { getAncestor } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { wrapReturnIfLuaTuple } from "TSTransformer/util/wrapReturnIfLuaTuple";

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
			const signature = state.typeChecker.getSignaturesOfType(
				state.getType(node.expression),
				ts.SignatureKind.Call,
			)[0];

			const lastParameter = signature.parameters[signature.parameters.length - 1].valueDeclaration;
			if (lastParameter && ts.isParameter(lastParameter) && lastParameter.dotDotDotToken) {
				DiagnosticService.addDiagnostic(errors.noVarArgsMacroSpread(lastArg));
				return;
			}

			const minArgumentCount = signature.minArgumentCount;
			const spread = args.pop();
			const tempIds = luau.list.make<luau.TemporaryIdentifier>();
			for (let i = args.length; i < minArgumentCount; i++) {
				const tempId = luau.tempId(`spread${i}`);
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

function isInsideRoactComponent(state: TransformState, node: ts.Node) {
	const classLikeAncestor = getAncestor(node, ts.isClassLike);
	if (classLikeAncestor) {
		return extendsRoactComponent(state, classLikeAncestor);
	}
	return false;
}

export function transformCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: luau.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	if (ts.isImportCall(node)) {
		return transformImportExpression(state, node);
	}

	validateNotAnyType(state, node.expression);

	if (ts.isSuperCall(node)) {
		if (isInsideRoactComponent(state, node)) {
			DiagnosticService.addDiagnostic(errors.noSuperConstructorRoactComponent(node));
		}
		return luau.call(luau.property(convertToIndexableExpression(expression), "constructor"), [
			luau.globals.self,
			...ensureTransformOrder(state, node.arguments),
		]);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
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
	node: ts.CallExpression,
	expression: ts.PropertyAccessExpression,
	baseExpression: luau.Expression,
	name: string,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	validateNotAnyType(state, node.expression);

	if (ts.isSuperProperty(expression)) {
		if (isInsideRoactComponent(state, node)) {
			DiagnosticService.addDiagnostic(errors.noSuperPropertyCallRoactComponent(node));
		}
		return luau.call(luau.property(convertToIndexableExpression(baseExpression), expression.name.text), [
			luau.globals.self,
			...ensureTransformOrder(state, node.arguments),
		]);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		const macro = state.services.macroManager.getPropertyCallMacro(symbol);
		if (macro) {
			return runCallMacro(macro, state, node, baseExpression, nodeArguments);
		}
	}

	let args!: Array<luau.Expression>;
	const prereqs = state.capturePrereqs(() => (args = ensureTransformOrder(state, nodeArguments)));
	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, baseExpression, node.expression)) {
		baseExpression = state.pushToVar(baseExpression);
	}
	state.prereqList(prereqs);

	let exp: luau.Expression;
	if (isMethod(state, expression)) {
		if (luau.isValidIdentifier(name)) {
			exp = luau.create(luau.SyntaxKind.MethodCallExpression, {
				name,
				expression: convertToIndexableExpression(baseExpression),
				args: luau.list.make(...args),
			});
		} else {
			baseExpression = state.pushToVarIfComplex(baseExpression);
			args.unshift(baseExpression);
			exp = luau.call(luau.property(convertToIndexableExpression(baseExpression), name), args);
		}
	} else {
		exp = luau.call(luau.property(convertToIndexableExpression(baseExpression), name), args);
	}

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformElementCallExpressionInner(
	state: TransformState,
	node: ts.CallExpression,
	expression: ts.ElementAccessExpression,
	baseExpression: luau.Expression,
	argumentExpression: ts.Expression,
	nodeArguments: ReadonlyArray<ts.Expression>,
) {
	validateNotAnyType(state, node.expression);

	if (ts.isSuperProperty(expression)) {
		if (isInsideRoactComponent(state, node)) {
			DiagnosticService.addDiagnostic(errors.noSuperPropertyCallRoactComponent(node));
		}
		return luau.call(
			luau.create(luau.SyntaxKind.ComputedIndexExpression, {
				expression: convertToIndexableExpression(baseExpression),
				index: transformExpression(state, expression.argumentExpression),
			}),
			[luau.globals.self, ...ensureTransformOrder(state, node.arguments)],
		);
	}

	const expType = state.typeChecker.getNonOptionalType(state.getType(node.expression));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		const macro = state.services.macroManager.getPropertyCallMacro(symbol);
		if (macro) {
			return runCallMacro(macro, state, node, baseExpression, nodeArguments);
		}
	}

	let args!: Array<luau.Expression>;
	const prereqs = state.capturePrereqs(
		() => (args = ensureTransformOrder(state, [argumentExpression, ...nodeArguments])),
	);
	if (!luau.list.isEmpty(prereqs) && expressionMightMutate(state, baseExpression, node.expression)) {
		baseExpression = state.pushToVar(baseExpression);
	}
	state.prereqList(prereqs);

	const argumentExp = args.shift()!;

	if (isMethod(state, expression)) {
		baseExpression = state.pushToVarIfComplex(baseExpression);
		args.unshift(baseExpression);
	}

	const exp = luau.call(
		luau.create(luau.SyntaxKind.ComputedIndexExpression, {
			expression: convertToIndexableExpression(baseExpression),
			index: addOneIfArrayType(
				state,
				state.typeChecker.getNonOptionalType(state.getType(expression.expression)),
				argumentExp,
			),
		}),
		args,
	);

	return wrapReturnIfLuaTuple(state, node, exp);
}

export function transformCallExpression(state: TransformState, node: ts.CallExpression) {
	return transformOptionalChain(state, node);
}

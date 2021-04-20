import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isMethod } from "TSTransformer/util/isMethod";
import { isValidMethodIndexWithoutCall } from "TSTransformer/util/isValidMethodIndexWithoutCall";
import { skipUpwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformPropertyAccessExpressionInner(
	state: TransformState,
	node: ts.PropertyAccessExpression,
	expression: luau.Expression,
	name: string,
) {
	validateNotAnyType(state, node.expression);

	const expType = state.typeChecker.getNonOptionalType(state.getType(node));
	const symbol = getFirstDefinedSymbol(state, expType);
	if (symbol) {
		if (state.services.macroManager.getPropertyCallMacro(symbol)) {
			DiagnosticService.addDiagnostic(errors.noMacroWithoutCall(node));
			return luau.emptyId();
		}
	}

	const parent = skipUpwards(node).parent;
	if (!isValidMethodIndexWithoutCall(parent) && isMethod(state, node)) {
		DiagnosticService.addDiagnostic(errors.noIndexWithoutCall(node));
		return luau.emptyId();
	}

	if (ts.isPrototypeAccess(node)) {
		DiagnosticService.addDiagnostic(errors.noPrototype(node));
	}

	const constantValue = state.typeChecker.getConstantValue(node);
	if (constantValue !== undefined) {
		return typeof constantValue === "string" ? luau.string(constantValue) : luau.number(constantValue);
	}

	if (ts.isDeleteExpression(parent)) {
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: luau.property(convertToIndexableExpression(expression), name),
				operator: "=",
				right: luau.nil(),
			}),
		);
		return luau.nil();
	}

	return luau.property(convertToIndexableExpression(expression), name);
}

export function transformPropertyAccessExpression(state: TransformState, node: ts.PropertyAccessExpression) {
	if (ts.isSuperProperty(node)) {
		DiagnosticService.addDiagnostic(errors.noSuperProperty(node));
		return luau.emptyId();
	}

	return transformOptionalChain(state, node);
}

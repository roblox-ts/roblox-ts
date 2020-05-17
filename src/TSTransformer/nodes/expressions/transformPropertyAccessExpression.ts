import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { TransformState } from "TSTransformer/TransformState";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isMethod } from "TSTransformer/util/isMethod";

export function transformPropertyAccessExpressionInner(
	state: TransformState,
	node: ts.PropertyAccessExpression,
	expression: lua.Expression,
	name: string,
) {
	if (state.macroManager.getPropertyCallMacro(state.getType(node).symbol)) {
		state.addDiagnostic(diagnostics.noMacroWithoutCall(node));
		return lua.emptyId();
	}

	if (isMethod(state, node)) {
		state.addDiagnostic(diagnostics.noIndexWithoutCall(node));
		return lua.emptyId();
	}

	const constantValue = state.typeChecker.getConstantValue(node);
	if (constantValue !== undefined) {
		return typeof constantValue === "string" ? lua.string(constantValue) : lua.number(constantValue);
	}

	return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
		expression: convertToIndexableExpression(expression),
		name,
	});
}

export function transformPropertyAccessExpression(state: TransformState, node: ts.PropertyAccessExpression) {
	return transformOptionalChain(state, node);
}

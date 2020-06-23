import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformOptionalChain } from "TSTransformer/nodes/transformOptionalChain";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { isMethod } from "TSTransformer/util/isMethod";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";

export function transformPropertyAccessExpressionInner(
	state: TransformState,
	node: ts.PropertyAccessExpression,
	expression: lua.Expression,
	name: string,
) {
	validateNotAnyType(state, node.expression);

	const symbol = getFirstDefinedSymbol(state, state.getType(node));
	if (symbol) {
		if (state.macroManager.getPropertyCallMacro(symbol)) {
			state.addDiagnostic(diagnostics.noMacroWithoutCall(node));
			return lua.emptyId();
		}
	}

	if (isMethod(state, node)) {
		state.addDiagnostic(diagnostics.noIndexWithoutCall(node));
		return lua.emptyId();
	}

	if (ts.isPrototypeAccess(node)) {
		state.addDiagnostic(diagnostics.noPrototype(node));
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
	if (ts.isSuperProperty(node)) {
		state.addDiagnostic(diagnostics.noSuperProperty(node));
	}

	return transformOptionalChain(state, node);
}

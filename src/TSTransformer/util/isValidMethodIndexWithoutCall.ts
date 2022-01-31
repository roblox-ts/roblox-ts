import { TransformState } from "TSTransformer";
import { CALL_MACROS } from "TSTransformer/macros/callMacros";
import { getFirstDefinedSymbol } from "TSTransformer/util/types";
import ts from "typescript";

export function isValidMethodIndexWithoutCall(state: TransformState, node: ts.Node): boolean {
	const { parent } = node;
	// a.b !== undefined
	if (ts.isBinaryExpression(parent)) {
		return true;
	}

	// !a.b
	if (ts.isPrefixUnaryExpression(parent)) {
		return true;
	}

	// typeIs/typeOf macros
	if (ts.isCallExpression(parent)) {
		const expType = state.typeChecker.getNonNullableType(state.getType(parent.expression));
		const symbol = getFirstDefinedSymbol(state, expType);
		if (symbol) {
			const macro = state.services.macroManager.getCallMacro(symbol);
			if (
				// typeIs will be a TypeError if usage is not the first argument
				macro === CALL_MACROS.typeIs ||
				macro === CALL_MACROS.typeOf
			) {
				return true;
			}
		}
	}

	return false;
}

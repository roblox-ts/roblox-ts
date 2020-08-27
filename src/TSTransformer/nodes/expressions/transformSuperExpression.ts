import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";

export function transformSuperExpression(state: TransformState, node: ts.SuperExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.globalSymbols.globalThis) {
		state.addDiagnostic(diagnostics.noGlobalThis(node));
	}

	return luau.globals.self;
}

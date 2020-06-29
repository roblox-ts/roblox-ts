import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { diagnostics } from "Shared/diagnostics";

export function transformThisExpression(state: TransformState, node: ts.ThisExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.globalSymbols.globalThis) {
		state.addDiagnostic(diagnostics.noGlobalThis(node));
	}

	return luau.globals.self;
}

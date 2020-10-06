import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";

export function transformThisExpression(state: TransformState, node: ts.ThisExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.services.globalSymbols.globalThis) {
		state.addDiagnostic(errors.noGlobalThis(node));
	}

	return luau.globals.self;
}

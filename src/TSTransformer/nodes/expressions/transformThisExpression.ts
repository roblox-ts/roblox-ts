import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { diagnostics } from "Shared/diagnostics";

export function transformThisExpression(state: TransformState, node: ts.ThisExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.globalSymbols.globalThis) {
		state.addDiagnostic(diagnostics.noGlobalThis(node));
	}

	return lua.globals.self;
}

import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

export function transformThisExpression(state: TransformState, node: ts.ThisExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.services.globalSymbols.globalThis) {
		DiagnosticService.addDiagnostic(errors.noGlobalThis(node));
	}

	return luau.globals.self;
}

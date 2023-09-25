import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import assert from "assert";
import ts from "typescript";

export function transformThisExpression(state: TransformState, node: ts.ThisExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.globalThis)) {
		DiagnosticService.addDiagnostic(errors.noGlobalThis(node));
	}

	if (state.isInStaticBlockDeclaration) {
		assert(symbol);
		const type = state.typeChecker.getTypeOfSymbolAtLocation(symbol, node);
		const symbolDeclaration = symbol.getDeclarations()?.[0];
		assert(symbolDeclaration);
		assert(ts.isClassDeclaration(symbolDeclaration));

		const className = symbolDeclaration.name;
		assert(className);

		return luau.id(className.text);
	} else {
	}
	return luau.globals.self;
}

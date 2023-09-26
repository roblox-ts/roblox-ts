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

	if (state.isInStaticBlockDeclaration && symbol) {
		const type = state.typeChecker.getTypeOfSymbolAtLocation(symbol, node);
		const classLikeDeclaration = symbol.valueDeclaration;
		assert(classLikeDeclaration);
		if (ts.isClassDeclaration(classLikeDeclaration)) {
			const className = classLikeDeclaration.name;
			assert(className);
			return luau.id(className.text);
		} else if (ts.isClassExpression(classLikeDeclaration)) {
			// todo
		}
	}
	return luau.globals.self;
}

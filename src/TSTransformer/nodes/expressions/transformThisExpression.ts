import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

export function transformThisExpression(state: TransformState, node: ts.ThisExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.globalThis)) {
		DiagnosticService.addDiagnostic(errors.noGlobalThis(node));
	}

	if (symbol) {
		const container = ts.getThisContainer(node, false, false);
		if (
			// ts.hasStaticModifier doesn't work on static blocks
			(ts.hasStaticModifier(container) || ts.isClassStaticBlockDeclaration(container)) &&
			ts.isClassLike(container.parent)
		) {
			const identifier = state.classIdentifierMap.get(container.parent);
			if (identifier) {
				return identifier;
			}
		}
	}

	return luau.globals.self;
}

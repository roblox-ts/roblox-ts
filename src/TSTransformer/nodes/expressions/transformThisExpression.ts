import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import { errors } from "Shared/diagnostics";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

function isInStaticBlockDeclaration(node: ts.Node) {
	while (node.parent) {
		const parent = node.parent;
		if (ts.isClassStaticBlockDeclaration(parent)) return true;
		if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
			break;
		}
		node = parent;
	}
	return false;
}

export function transformThisExpression(state: TransformState, node: ts.ThisExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.globalThis)) {
		DiagnosticService.addDiagnostic(errors.noGlobalThis(node));
	}

	if (isInStaticBlockDeclaration(node) && symbol) {
		const classLikeDeclaration = symbol.valueDeclaration;

		assert(classLikeDeclaration);
		assert(ts.isClassDeclaration(classLikeDeclaration) || ts.isClassExpression(classLikeDeclaration));

		const ident = state.classIdentifierMap.get(classLikeDeclaration);
		assert(ident);

		return ident;
	}
	return luau.globals.self;
}

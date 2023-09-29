import luau from "@roblox-ts/luau-ast";
import assert from "assert";
import { errors } from "Shared/diagnostics";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import ts from "typescript";

type ThisExpressionParent = ts.ClassStaticBlockDeclaration | ts.PropertyDeclaration | ts.MethodDeclaration;

function getThisExpressionParent(node: ts.Node): ThisExpressionParent | undefined {
	while (node.parent) {
		const parent = node.parent;
		if (
			ts.isClassStaticBlockDeclaration(parent) ||
			ts.isPropertyDeclaration(parent) ||
			ts.isMethodDeclaration(parent)
		)
			return parent;
		if (ts.isClassDeclaration(parent) || ts.isClassExpression(parent)) {
			break;
		}
		node = parent;
	}
}

export function transformThisExpression(state: TransformState, node: ts.ThisExpression) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.globalThis)) {
		DiagnosticService.addDiagnostic(errors.noGlobalThis(node));
	}

	const parent = getThisExpressionParent(node);
	if (!parent || !symbol) {
		return luau.globals.self;
	}

	if (
		ts.isClassStaticBlockDeclaration(parent) ||
		(ts.isPropertyDeclaration(parent) && ts.hasStaticModifier(parent))
	) {
		const classLikeDeclaration = symbol.valueDeclaration;
		assert(classLikeDeclaration);
		assert(ts.isClassDeclaration(classLikeDeclaration) || ts.isClassExpression(classLikeDeclaration));

		const ident = state.classIdentifierMap.get(classLikeDeclaration);
		assert(ident);

		return ident;
	}
	
	return luau.globals.self;
}

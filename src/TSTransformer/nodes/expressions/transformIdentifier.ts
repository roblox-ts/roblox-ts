import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";

export function transformIdentifierDefined(state: TransformState, node: ts.Identifier) {
	return lua.create(lua.SyntaxKind.Identifier, {
		name: node.text,
	});
}

export function transformIdentifier(state: TransformState, node: ts.Identifier) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	if (symbol) {
		if (state.typeChecker.isUndefinedSymbol(symbol)) {
			return lua.nil();
		}
		const macro = state.macroManager.getIdentifierMacro(symbol);
		if (macro) {
			return macro(state, node);
		}
	}
	return transformIdentifierDefined(state, node);
}

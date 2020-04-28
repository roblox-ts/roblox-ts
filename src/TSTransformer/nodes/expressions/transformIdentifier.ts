import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";
import { assert } from "Shared/util/assert";

export function transformIdentifierDefined(state: TransformState, node: ts.Identifier) {
	return lua.create(lua.SyntaxKind.Identifier, {
		name: node.text,
	});
}

export function transformIdentifier(state: TransformState, node: ts.Identifier) {
	const symbol = state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);
	if (state.typeChecker.isUndefinedSymbol(symbol)) {
		return lua.nil();
	}
	const macro = state.macroManager.getIdentifierMacro(symbol);
	if (macro) {
		return macro(state, node);
	}

	debugger;

	return transformIdentifierDefined(state, node);
}

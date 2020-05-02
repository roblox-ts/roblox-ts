import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { isBlockLike } from "TSTransformer/typeGuards";

export function transformIdentifierDefined(state: TransformState, node: ts.Identifier) {
	return lua.create(lua.SyntaxKind.Identifier, {
		name: node.text,
	});
}

function getAncestorWhichIsChildOf(parent: ts.Node, node: ts.Node) {
	while (node.parent && node.parent !== parent) {
		node = node.parent;
	}
	return node.parent ? node : undefined;
}

function getDeclarationStatement(node: ts.Node): ts.Statement | undefined {
	while (node && !ts.isStatement(node)) {
		node = node.parent;
	}
	return node;
}

function checkHoist(state: TransformState, node: ts.Identifier, symbol: ts.Symbol) {
	if (state.isHoisted.get(symbol) !== undefined) {
		return;
	}

	const declaration = symbol.valueDeclaration;

	// parameters cannot be hoisted
	if (!declaration || ts.isParameter(declaration) || ts.isShorthandPropertyAssignment(declaration)) {
		return;
	}

	const declarationStatement = getDeclarationStatement(declaration);
	if (!declarationStatement) {
		return;
	}

	const parent = declarationStatement.parent;
	if (!parent || !isBlockLike(parent)) {
		return;
	}

	const sibling = getAncestorWhichIsChildOf(parent, node);
	if (!sibling || !ts.isStatement(sibling)) {
		return;
	}

	const declarationIdx = parent.statements.indexOf(declarationStatement);
	const siblingIdx = parent.statements.indexOf(sibling);

	if (siblingIdx > declarationIdx) {
		return;
	}

	if (siblingIdx === declarationIdx) {
		// function declarations and variable statements can self refer
		if (ts.isFunctionDeclaration(declarationStatement) || ts.isVariableStatement(declarationStatement)) {
			return;
		}
	}

	getOrSetDefault(state.hoistsByStatement, sibling, () => new Array<ts.Identifier>()).push(node);
	state.isHoisted.set(symbol, true);

	return;
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

	checkHoist(state, node, symbol);

	return transformIdentifierDefined(state, node);
}

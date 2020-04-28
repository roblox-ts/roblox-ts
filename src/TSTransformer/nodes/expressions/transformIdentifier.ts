import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "typescript";
import { assert } from "Shared/util/assert";

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

function isBlockLike(node: ts.Node): node is ts.BlockLike {
	return (
		node.kind === ts.SyntaxKind.SourceFile ||
		node.kind === ts.SyntaxKind.Block ||
		node.kind === ts.SyntaxKind.ModuleBlock ||
		node.kind === ts.SyntaxKind.CaseClause ||
		node.kind === ts.SyntaxKind.DefaultClause
	);
}

function getDeclarationStatement(node: ts.Node): ts.Statement | undefined {
	while (node && !ts.isStatement(node)) {
		node = node.parent;
	}
	return node;
}

function shouldHoist(node: ts.Identifier, symbol: ts.Symbol) {
	const declaration = getDeclarationStatement(symbol.valueDeclaration);
	if (!declaration) {
		return false;
	}

	const parent = declaration.parent;
	if (!parent || !isBlockLike(parent)) {
		return false;
	}

	const sibling = getAncestorWhichIsChildOf(parent, node);
	if (!sibling || !ts.isStatement(sibling)) {
		return false;
	}

	const declarationIdx = parent.statements.indexOf(declaration);
	const siblingIdx = parent.statements.indexOf(sibling);

	if (siblingIdx > declarationIdx) {
		return false;
	}

	if (siblingIdx === declarationIdx) {
		// function declarations can self refer
		if (ts.isFunctionDeclaration(declaration)) {
			return false;
		}
	}

	console.log("hoist", declaration.getText());
	debugger;

	return true;
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

	const needsHoist = shouldHoist(node, symbol);

	return transformIdentifierDefined(state, node);
}

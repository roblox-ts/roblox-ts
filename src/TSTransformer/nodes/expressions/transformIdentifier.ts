import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { TransformState } from "TSTransformer";
import { isBlockLike } from "TSTransformer/typeGuards";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { getAncestor, skipUpwards } from "TSTransformer/util/traversal";

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

function checkIdentifierHoist(state: TransformState, node: ts.Identifier, symbol: ts.Symbol) {
	if (state.isHoisted.get(symbol) !== undefined) {
		return;
	}

	const declaration = symbol.valueDeclaration;

	// parameters cannot be hoisted
	if (!declaration || ts.isParameter(declaration) || ts.isShorthandPropertyAssignment(declaration)) {
		return;
	}

	const declarationStatement = getAncestor(declaration, ts.isStatement);
	if (
		!declarationStatement ||
		ts.isForStatement(declarationStatement) ||
		ts.isForOfStatement(declarationStatement) ||
		ts.isTryStatement(declarationStatement)
	) {
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
		if (
			ts.isFunctionDeclaration(declarationStatement) ||
			(ts.isVariableStatement(declarationStatement) && getAncestor(node, ts.isStatement) === declarationStatement)
		) {
			return;
		}
	}

	getOrSetDefault(state.hoistsByStatement, sibling, () => new Array<ts.Identifier>()).push(node);
	state.isHoisted.set(symbol, true);

	return;
}

export function transformIdentifier(state: TransformState, node: ts.Identifier) {
	const symbol = ts.isShorthandPropertyAssignment(node.parent)
		? state.typeChecker.getShorthandAssignmentValueSymbol(node.parent)
		: state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);

	if (state.typeChecker.isUndefinedSymbol(symbol)) {
		return lua.nil();
	} else if (state.typeChecker.isArgumentsSymbol(symbol)) {
		state.addDiagnostic(diagnostics.noArguments(node));
	} else if (symbol === state.globalSymbols.globalThis) {
		state.addDiagnostic(diagnostics.noGlobalThis(node));
	}

	const macro = state.macroManager.getIdentifierMacro(symbol);
	if (macro) {
		return macro(state, node);
	}

	if (!ts.isCallExpression(skipUpwards(node).parent) && state.macroManager.getCallMacro(symbol)) {
		state.addDiagnostic(diagnostics.noMacroWithoutCall(node));
		return lua.emptyId();
	}

	// exit here for export let so we don't check hoist later
	if (symbol.valueDeclaration && symbol.valueDeclaration.getSourceFile() === state.sourceFile) {
		const exportAccess = state.getModuleIdPropertyAccess(symbol, node);
		if (exportAccess && isDefinedAsLet(state, symbol)) {
			return exportAccess;
		}
	}

	checkIdentifierHoist(state, node, symbol);

	return transformIdentifierDefined(state, node);
}

import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { isBlockLike } from "TSTransformer/typeGuards";
import { isDefinedAsLet } from "TSTransformer/util/isDefinedAsLet";
import { getAncestor, isAncestorOf, skipDownwards, skipUpwards } from "TSTransformer/util/traversal";
import { getFirstConstructSymbol } from "TSTransformer/util/types";

export function transformIdentifierDefined(state: TransformState, node: ts.Identifier) {
	return luau.create(luau.SyntaxKind.Identifier, {
		name: node.text,
	});
}

function getAncestorWhichIsChildOf(parent: ts.Node, node: ts.Node) {
	while (node.parent && node.parent !== parent) {
		node = node.parent;
	}
	return node.parent ? node : undefined;
}

// for some reason, symbol.valueDeclaration doesn't point to imports?
function getDeclarationFromImport(symbol: ts.Symbol) {
	for (const declaration of symbol.declarations) {
		const importDec = getAncestor(declaration, ts.isImportDeclaration);
		if (importDec) {
			return declaration;
		}
	}
}

function checkIdentifierHoist(state: TransformState, node: ts.Identifier, symbol: ts.Symbol) {
	if (state.isHoisted.get(symbol) !== undefined) {
		return;
	}

	const declaration = symbol.valueDeclaration ?? getDeclarationFromImport(symbol);

	// parameters cannot be hoisted
	if (!declaration || getAncestor(declaration, ts.isParameter) || ts.isShorthandPropertyAssignment(declaration)) {
		return;
	}

	// class expressions can self refer
	if (ts.isClassLike(declaration) && isAncestorOf(declaration, node)) {
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
		// non-async function declarations, class declarations, and variable statements can self refer
		if (
			(ts.isFunctionDeclaration(declarationStatement) &&
				!(declarationStatement.modifierFlagsCache & ts.ModifierFlags.Async)) ||
			ts.isClassDeclaration(declarationStatement) ||
			(ts.isVariableStatement(declarationStatement) && getAncestor(node, ts.isStatement) === declarationStatement)
		) {
			return;
		}
	}

	getOrSetDefault(state.hoistsByStatement, sibling, () => new Array<ts.Identifier>()).push(node);
	state.isHoisted.set(symbol, true);

	return;
}

function isValidObjectUse(node: ts.Identifier) {
	const parent = skipUpwards(node).parent;
	if (ts.isPropertyAccessExpression(parent) || ts.isElementAccessExpression(parent)) {
		const grandParent = skipUpwards(parent).parent;
		if (ts.isCallExpression(grandParent)) {
			return true;
		}
	}
	return false;
}

export function transformIdentifier(state: TransformState, node: ts.Identifier) {
	const symbol = ts.isShorthandPropertyAssignment(node.parent)
		? state.typeChecker.getShorthandAssignmentValueSymbol(node.parent)
		: state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);

	if (state.typeChecker.isUndefinedSymbol(symbol)) {
		return luau.nil();
	} else if (state.typeChecker.isArgumentsSymbol(symbol)) {
		state.addDiagnostic(errors.noArguments(node));
	} else if (symbol === state.services.globalSymbols.globalThis) {
		state.addDiagnostic(errors.noGlobalThis(node));
	}

	const macro = state.services.macroManager.getIdentifierMacro(symbol);
	if (macro) {
		return macro(state, node);
	}

	if (symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Object) && !isValidObjectUse(node)) {
		state.addDiagnostic(errors.noObjectWithoutMethod(node));
	}

	const constructSymbol = getFirstConstructSymbol(state, node);
	if (constructSymbol) {
		const constructorMacro = state.services.macroManager.getConstructorMacro(constructSymbol);
		if (constructorMacro) {
			state.addDiagnostic(errors.noConstructorMacroWithoutNew(node));
		}
	}

	const parent = skipUpwards(node).parent;
	if (
		(!ts.isCallExpression(parent) || skipDownwards(parent.expression) != node) &&
		state.services.macroManager.getCallMacro(symbol)
	) {
		state.addDiagnostic(errors.noMacroWithoutCall(node));
		return luau.emptyId();
	}

	// exit here for export let so we don't check hoist later
	if (symbol.valueDeclaration && symbol.valueDeclaration.getSourceFile() === node.getSourceFile()) {
		const exportAccess = state.getModuleIdPropertyAccess(symbol);
		if (exportAccess && isDefinedAsLet(state, symbol)) {
			return exportAccess;
		}
	}

	checkIdentifierHoist(state, node, symbol);

	return transformIdentifierDefined(state, node);
}

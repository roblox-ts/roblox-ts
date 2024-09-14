import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { isBlockLike, isNamespace } from "TSTransformer/typeGuards";
import { getExtendsNode } from "TSTransformer/util/getExtendsNode";
import { isSymbolMutable } from "TSTransformer/util/isSymbolMutable";
import { getAncestor, isAncestorOf, skipDownwards, skipUpwards } from "TSTransformer/util/traversal";
import { getFirstConstructSymbol } from "TSTransformer/util/types";
import ts from "typescript";

export function transformIdentifierDefined(state: TransformState, node: ts.Identifier) {
	const symbol = ts.isShorthandPropertyAssignment(node.parent)
		? state.typeChecker.getShorthandAssignmentValueSymbol(node.parent)
		: state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);

	const replacementId = state.symbolToIdMap.get(symbol);
	if (replacementId) {
		return replacementId;
	}

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
	for (const declaration of symbol.declarations ?? []) {
		const importDec = getAncestor(declaration, ts.isAnyImportSyntax);
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
				!ts.hasSyntacticModifier(declarationStatement, ts.ModifierFlags.Async)) ||
			ts.isClassDeclaration(declarationStatement) ||
			(ts.isVariableStatement(declarationStatement) &&
				getAncestor(node, node => ts.isStatement(node) || ts.isFunctionLikeDeclaration(node)) ===
					declarationStatement)
		) {
			return;
		}
	}

	getOrSetDefault(state.hoistsByStatement, sibling, () => new Array<ts.Identifier>()).push(node);
	state.isHoisted.set(symbol, true);

	return;
}

export function transformIdentifier(state: TransformState, node: ts.Identifier) {
	// synthetic nodes don't have parents or symbols, so skip all the symbol-related logic
	// JSX EntityName functions like `getJsxFactoryEntity()` will return synthetic nodes
	// and transformEntityName will eventually end up here
	if (!node.parent || ts.positionIsSynthesized(node.pos)) {
		return luau.create(luau.SyntaxKind.Identifier, { name: node.text });
	}

	const symbol = ts.isShorthandPropertyAssignment(node.parent)
		? state.typeChecker.getShorthandAssignmentValueSymbol(node.parent)
		: state.typeChecker.getSymbolAtLocation(node);
	assert(symbol);

	if (state.typeChecker.isUndefinedSymbol(symbol)) {
		return luau.nil();
	} else if (state.typeChecker.isArgumentsSymbol(symbol)) {
		DiagnosticService.addDiagnostic(errors.noArguments(node));
	} else if (symbol === state.services.macroManager.getSymbolOrThrow(SYMBOL_NAMES.globalThis)) {
		DiagnosticService.addDiagnostic(errors.noGlobalThis(node));
	}

	const macro = state.services.macroManager.getIdentifierMacro(symbol);
	if (macro) {
		return macro(state, node);
	}

	const constructSymbol = getFirstConstructSymbol(state, node);
	if (constructSymbol) {
		const constructorMacro = state.services.macroManager.getConstructorMacro(constructSymbol);
		if (constructorMacro) {
			const isClassExtendsNode =
				ts.isClassLike(node.parent.parent.parent) &&
				getExtendsNode(node.parent.parent.parent)?.expression === node;
			if (isClassExtendsNode) {
				DiagnosticService.addDiagnostic(errors.noMacroExtends(node));
			} else {
				DiagnosticService.addDiagnostic(errors.noConstructorMacroWithoutNew(node));
			}
		}
	}

	const parent = skipUpwards(node).parent;
	if (
		(!ts.isCallExpression(parent) || skipDownwards(parent.expression) != node) &&
		state.services.macroManager.getCallMacro(symbol)
	) {
		DiagnosticService.addDiagnostic(errors.noIndexWithoutCall(node));
		return luau.none();
	}

	// exit here for export let so we don't check hoist later
	if (
		symbol.valueDeclaration &&
		symbol.valueDeclaration.getSourceFile() === node.getSourceFile() &&
		getAncestor(symbol.valueDeclaration, node => ts.isModuleDeclaration(node) && !isNamespace(node)) === undefined
	) {
		const exportAccess = state.getModuleIdPropertyAccess(symbol);
		if (exportAccess && isSymbolMutable(state, symbol)) {
			return exportAccess;
		}
	}

	checkIdentifierHoist(state, node, symbol);

	return transformIdentifierDefined(state, node);
}

import * as ts from "ts-morph";
import { CompilerState } from "../CompilerState";
import { luaStringify } from "../utility/general";
import { checkReservedAccess } from ".";

const BUILT_INS = new Set(["Promise", "Symbol", "typeIs", "opcall"]);

const replacements = new Map<string, string>([
	["undefined", "nil"],
	["typeOf", "typeof"],
]);

const PKG_VERSION_ID = "PKG_VERSION";

export function compileIdentifier(state: CompilerState, node: ts.Identifier, isDefinition = false) {
	let name = node.getText();

	checkReservedAccess(node);

	const replacement = replacements.get(name);
	if (replacement) {
		return replacement;
	}

	if (BUILT_INS.has(name)) {
		state.usesTSLibrary = true;
		name = `TS.${name}`;
	}

	if (name === PKG_VERSION_ID) {
		return luaStringify(state.pkgVersion);
	}

	const definitions = isDefinition ? [node] : node.getDefinitions().map(def => def.getNode());

	for (const definition of definitions) {
		// I have no idea why, but getDefinitionNodes() cannot replace this
		if (definition.getSourceFile() === node.getSourceFile()) {
			let parent = definition;

			do {
				if (ts.TypeGuards.isVariableStatement(parent)) {
					if (parent.hasExportKeyword()) {
						const declarationKind = parent.getDeclarationKind();
						if (declarationKind === ts.VariableDeclarationKind.Let) {
							return state.getExportContextName(parent) + "." + name;
						} else if (declarationKind === ts.VariableDeclarationKind.Const) {
							const idContext = node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);
							const defContext = parent.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);

							if (idContext && defContext && idContext !== defContext) {
								state.pushHoistStack(`local ${name} = ${state.getNameForContext(defContext)}.${name}`);
							}
						}
					}
					break;
				} else if (ts.TypeGuards.isNamespaceDeclaration(parent)) {
					// If within a namespace, scope it. If it is a namespace, don't
					if (parent !== definition.getParent()) {
						const parentName = state.namespaceStack.get(parent.getName());
						if (parentName) {
							return parentName + "." + name;
						}
					}
					break;
				} else if (parent.getKind() === ts.SyntaxKind.OpenParenToken) {
					parent = parent.getParent()!;
					if (!ts.TypeGuards.isArrowFunction(parent)) {
						break;
					}
				} else if (
					!ts.TypeGuards.isVariableDeclarationList(parent) &&
					!ts.TypeGuards.isIdentifier(parent) &&
					!ts.TypeGuards.isBindingElement(parent) &&
					!ts.TypeGuards.isArrayBindingPattern(parent) &&
					!ts.TypeGuards.isVariableDeclaration(parent) &&
					!ts.TypeGuards.isObjectBindingPattern(parent)
				) {
					break;
				}
				parent = parent.getParent();
			} while (parent);
		}
	}

	return state.getAlias(name);
}

import * as ts from "ts-morph";
import { checkReserved } from ".";
import { TranspilerState } from "../TranspilerState";

export const BUILT_INS = ["Promise", "Symbol", "typeIs"];

export const replacements = new Map<string, string>([["undefined", "nil"], ["typeOf", "typeof"]]);

export function transpileIdentifier(state: TranspilerState, node: ts.Identifier, isDefinition: boolean = false) {
	let name = node.getText();

	const replacement = replacements.get(name);
	if (replacement) {
		return replacement;
	}

	checkReserved(name, node);
	if (BUILT_INS.indexOf(name) !== -1) {
		state.usesTSLibrary = true;
		name = `TS.${name}`;
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
					parent = parent.getParent();
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

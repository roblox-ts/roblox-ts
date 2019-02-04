import * as ts from "ts-morph";
import { checkReserved } from ".";
import { TranspilerState } from "../class/TranspilerState";

export const BUILT_INS = ["Promise", "Symbol", "typeIs"];

export function transpileIdentifier(state: TranspilerState, node: ts.Identifier) {
	let name = node.getText();
	if (name === "undefined") {
		return "nil";
	}
	checkReserved(name, node);
	if (BUILT_INS.indexOf(name) !== -1) {
		name = `TS.${name}`;
	}

	for (const def of node.getDefinitions()) {
		// I have no idea why, but getDefinitionNodes() cannot replace this
		const definition = def.getNode();

		if (def.getSourceFile() === node.getSourceFile()) {
			let parent = definition;

			while (parent) {
				if (ts.TypeGuards.isVariableStatement(parent)) {
					if (parent.hasExportKeyword()) {
						return state.getExportContextName(parent) + "." + name;
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
				} else if (
					!ts.TypeGuards.isVariableDeclaration(parent) &&
					!ts.TypeGuards.isVariableDeclarationList(parent) &&
					!ts.TypeGuards.isIdentifier(parent)
				) {
					break;
				}
				parent = parent.getParent();
			}
		}
		const namespace = state.variableAliases.get(name);

		if (namespace) {
			return namespace;
		}
	}

	return name;
}

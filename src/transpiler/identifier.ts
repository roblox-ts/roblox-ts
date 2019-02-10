import * as ts from "ts-morph";
import { checkNonAny, checkReserved } from ".";
import { TranspilerState } from "../TranspilerState";

export const BUILT_INS = ["Promise", "Symbol", "typeIs"];

export function transpileIdentifier(state: TranspilerState, node: ts.Identifier) {
	let name = node.getText();
	if (name === "undefined") {
		return "nil";
	}
	checkReserved(name, node);
	if (BUILT_INS.indexOf(name) !== -1) {
		state.usesTSLibrary = true;
		name = `TS.${name}`;
	}

	checkNonAny(node);

	for (const def of node.getDefinitions()) {
		// I have no idea why, but getDefinitionNodes() cannot replace this
		const definition = def.getNode();
		let isArrowFunction = false;

		if (def.getSourceFile() === node.getSourceFile()) {
			let parent = definition;

			do {
				if (ts.TypeGuards.isVariableStatement(parent)) {
					if (parent.hasExportKeyword()) {
						const declarationKind = parent.getDeclarationKind();
						if (!isArrowFunction || declarationKind === ts.VariableDeclarationKind.Let) {
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
				} else if (ts.TypeGuards.isVariableDeclaration(parent)) {
					const lhs = parent.getChildAtIndex(0);
					if (lhs) {
						const eq = lhs.getNextSibling();
						if (eq) {
							const rhs = eq.getNextSibling();
							if (rhs) {
								if (ts.TypeGuards.isArrowFunction(rhs)) {
									isArrowFunction = true;
								}
							}
						}
					}
				} else if (!ts.TypeGuards.isVariableDeclarationList(parent) && !ts.TypeGuards.isIdentifier(parent)) {
					break;
				}
				parent = parent.getParent();
			} while (parent);
		}
	}

	return state.getAlias(name);
}

import * as ts from "ts-morph";
import { TranspilerError, TranspilerErrorType } from "../class/errors/TranspilerError";
import { TranspilerState } from "../class/TranspilerState";
import { ScriptContext } from "../utility";

function getJSDocs(node: ts.Node) {
	const symbol = node.getSymbol();
	if (symbol) {
		const valDec = symbol.getValueDeclaration();
		if (valDec) {
			if (ts.TypeGuards.isPropertySignature(valDec) || ts.TypeGuards.isMethodSignature(valDec)) {
				return valDec.getJsDocs();
			}
		}
	}
	return [];
}

function hasDirective(node: ts.Node, directive: string) {
	for (const jsDoc of getJSDocs(node)) {
		if (
			jsDoc
				.getText()
				.split(" ")
				.indexOf(directive) !== -1
		) {
			return true;
		}
	}
	return false;
}

export function validateApiAccess(state: TranspilerState, node: ts.Node) {
	if (state.compiler.noHeuristics) {
		return;
	}
	if (state.scriptContext === ScriptContext.Server) {
		if (hasDirective(node, "@rbx-client")) {
			throw new TranspilerError(
				"Server script attempted to access a client-only API!",
				node,
				TranspilerErrorType.InvalidClientOnlyAPIAccess,
			);
		}
	} else if (state.scriptContext === ScriptContext.Client) {
		if (hasDirective(node, "@rbx-server")) {
			throw new TranspilerError(
				"Client script attempted to access a server-only API!",
				node,
				TranspilerErrorType.InvalidServerOnlyAPIAccess,
			);
		}
	}
}

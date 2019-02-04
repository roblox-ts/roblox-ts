import * as ts from "ts-morph";
import { checkReserved, transpileStatementedNode } from ".";
import { TranspilerError, TranspilerErrorType } from "../class/errors/TranspilerError";
import { TranspilerState } from "../class/TranspilerState";
import { isTypeOnlyNamespace } from "../typeUtilities";

function safeMapGet<T, R>(map: Map<T, R>, key: T, node: ts.Node) {
	const find = map.get(key);
	if (!find) {
		throw new TranspilerError(
			`Failed to find context for ${node.getKindName()} ${node.getText()}`,
			node,
			TranspilerErrorType.BadContext,
		);
	}
	return find;
}

export function transpileNamespaceDeclaration(state: TranspilerState, node: ts.NamespaceDeclaration) {
	if (isTypeOnlyNamespace(node)) {
		return "";
	}
	state.pushIdStack();
	const name = node.getName();
	checkReserved(name, node);
	const parentNamespace = node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);
	state.pushExport(name, node);
	state.hoistStack[state.hoistStack.length - 1].add(name);
	let result = "";
	const id = state.getNewId();
	const previousName = state.namespaceStack.get(name);
	if (parentNamespace) {
		const parentName = safeMapGet(state.namespaceStack, parentNamespace.getName(), node);
		result += state.indent + `${name} = ${parentName}.${name} or {} do\n`;
	} else {
		result += state.indent + `${name} = ${name} or {} do\n`;
	}
	state.namespaceStack.set(name, id);
	state.pushIndent();
	result += state.indent + `local ${id} = ${name};\n`;
	result += transpileStatementedNode(state, node);
	if (previousName) {
		state.namespaceStack.set(name, previousName);
	} else {
		state.namespaceStack.delete(name);
	}
	state.popIndent();
	result += state.indent + `end;\n`;
	state.popIdStack();
	return result;
}

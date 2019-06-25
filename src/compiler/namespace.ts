import * as ts from "ts-morph";
import { checkReserved, compileStatementedNode } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { isTypeOnlyNamespace } from "../typeUtilities";

function safeMapGet<T, R>(map: Map<T, R>, key: T, node: ts.Node) {
	const find = map.get(key);
	if (!find) {
		throw new CompilerError(
			`Failed to find context for ${node.getKindName()} ${node.getText()}`,
			node,
			CompilerErrorType.BadContext,
		);
	}
	return find;
}

export function compileNamespaceDeclaration(state: CompilerState, node: ts.NamespaceDeclaration) {
	if (isTypeOnlyNamespace(node)) {
		return "";
	}
	state.pushIdStack();
	const name = node.getName();
	checkReserved(name, node);
	const parentNamespace = node.getFirstAncestorByKind(ts.SyntaxKind.ModuleDeclaration);
	state.pushExport(name, node);
	state.pushHoistStack(name);
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
	result += compileStatementedNode(state, node);
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

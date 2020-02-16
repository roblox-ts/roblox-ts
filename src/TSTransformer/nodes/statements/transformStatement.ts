import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformBlock } from "TSTransformer/nodes/statements/transformBlock";
import { transformExpressionStatement } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformFunctionDeclaration } from "TSTransformer/nodes/statements/transformFunctionDeclaration";
import { transformIfStatement } from "TSTransformer/nodes/statements/transformIfStatement";
import { transformReturnStatement } from "TSTransformer/nodes/statements/transformReturnStatement";
import { transformVariableStatement } from "TSTransformer/nodes/statements/transformVariableStatement";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";
import { diagnostics } from "TSTransformer/diagnostics";

function isTypeStatement(node: ts.Statement) {
	return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

function isDeclaredStatement(node: ts.Statement) {
	for (const modifier of node.modifiers ?? []) {
		if (modifier.kind === ts.SyntaxKind.DeclareKeyword) {
			return true;
		}
	}
	return false;
}

type StatementTransformer<T extends ts.Statement> = (node: T) => lua.List<lua.Statement>;

const STATEMENT_TRANSFORMERS = {};

export function transformStatement(state: TransformState, node: ts.Statement): lua.List<lua.Statement> {
	// no emit
	if (isTypeStatement(node) || isDeclaredStatement(node) || ts.isEmptyStatement(node)) return lua.list.make();

	// banned statements
	let diagnostic: ts.Diagnostic | undefined;

	if (false) throw "";
	else if (ts.isTryStatement(node)) diagnostic = diagnostics.noTryStatement(node);
	else if (ts.isForInStatement(node)) diagnostic = diagnostics.noForInStatement(node);
	else if (ts.isLabeledStatement(node)) diagnostic = diagnostics.noLabeledStatement(node);
	else if (ts.isDebuggerStatement(node)) diagnostic = diagnostics.noDebuggerStatement(node);

	if (diagnostic) {
		state.diagnostics.push(diagnostic);
		return lua.list.make();
	}

	// regular transformations
	if (false) throw "";
	else if (ts.isBlock(node)) return transformBlock(state, node);
	else if (ts.isExpressionStatement(node)) return transformExpressionStatement(state, node);
	else if (ts.isFunctionDeclaration(node)) return transformFunctionDeclaration(state, node);
	else if (ts.isIfStatement(node)) return transformIfStatement(state, node);
	else if (ts.isReturnStatement(node)) return transformReturnStatement(state, node);
	else if (ts.isVariableStatement(node)) return transformVariableStatement(state, node);

	throw new Error(`Unknown statement: ${getKindName(node)}`);
}

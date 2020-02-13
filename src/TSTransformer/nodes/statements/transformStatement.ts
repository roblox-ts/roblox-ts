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

function isTypeStatement(node: ts.Statement) {
	return ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node);
}

export function transformStatement(state: TransformState, node: ts.Statement): lua.List<lua.Statement> {
	const result = lua.list.make<lua.Statement>();

	for (const comment of state.getLeadingComments(node) ?? []) {
		lua.list.push(result, lua.comment(comment));
	}

	if (isTypeStatement(node)) return result;

	if (false) throw "";
	else if (ts.isVariableStatement(node)) lua.list.pushList(result, transformVariableStatement(state, node));
	else if (ts.isExpressionStatement(node)) lua.list.pushList(result, transformExpressionStatement(state, node));
	else if (ts.isFunctionDeclaration(node)) lua.list.pushList(result, transformFunctionDeclaration(state, node));
	else if (ts.isReturnStatement(node)) lua.list.pushList(result, transformReturnStatement(state, node));
	else if (ts.isIfStatement(node)) lua.list.pushList(result, transformIfStatement(state, node));
	else if (ts.isBlock(node)) lua.list.pushList(result, transformBlock(state, node));
	else throw new Error(`Unknown statement: ${getKindName(node)}`);

	return result;
}

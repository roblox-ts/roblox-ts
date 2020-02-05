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
	if (isTypeStatement(node)) return lua.list.make();

	if (false) throw "";
	else if (ts.isVariableStatement(node)) return transformVariableStatement(state, node);
	else if (ts.isExpressionStatement(node)) return transformExpressionStatement(state, node);
	else if (ts.isFunctionDeclaration(node)) return transformFunctionDeclaration(state, node);
	else if (ts.isReturnStatement(node)) return transformReturnStatement(state, node);
	else if (ts.isReturnStatement(node)) return transformReturnStatement(state, node);
	else if (ts.isIfStatement(node)) return transformIfStatement(state, node);
	else if (ts.isBlock(node)) return transformBlock(state, node);
	throw new Error(`Unknown statement: ${getKindName(node)}`);
}

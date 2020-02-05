import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpressionStatement } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformFunctionDeclaration } from "TSTransformer/nodes/statements/transformFunctionDeclaration";
import { transformIfStatement } from "TSTransformer/nodes/statements/transformIfStatement";
import { transformReturnStatement } from "TSTransformer/nodes/statements/transformReturnStatement";
import { transformVariableStatement } from "TSTransformer/nodes/statements/transformVariableStatement";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

export function transformStatement(state: TransformState, node: ts.Statement): lua.List<lua.Statement> {
	if (false) throw "";
	else if (ts.isVariableStatement(node)) return transformVariableStatement(state, node);
	else if (ts.isExpressionStatement(node)) return transformExpressionStatement(state, node);
	else if (ts.isFunctionDeclaration(node)) return transformFunctionDeclaration(state, node);
	else if (ts.isReturnStatement(node)) return transformReturnStatement(state, node);
	else if (ts.isReturnStatement(node)) return transformReturnStatement(state, node);
	else if (ts.isIfStatement(node)) return transformIfStatement(state, node);
	throw new Error(`Unknown statement: ${getKindName(node)}`);
}

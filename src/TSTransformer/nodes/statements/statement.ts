import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformVariableStatement } from "TSTransformer/nodes/statements/variableStatement";
import { getKindName } from "TSTransformer/util/ast";
import ts from "typescript";

export function transformStatement(state: TransformState, node: ts.Statement): lua.List<lua.Statement> {
	if (ts.isVariableStatement(node)) {
		return transformVariableStatement(state, node);
	}
	throw new Error(`Unknown statement: ${getKindName(node)}`);
}

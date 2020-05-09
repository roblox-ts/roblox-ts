import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "byots";

export function transformForStatement(state: TransformState, node: ts.ForStatement) {
	return lua.list.make<lua.Statement>();
}

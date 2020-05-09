import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import ts from "byots";

export function transformForOfStatement(state: TransformState, node: ts.ForOfStatement) {
	return lua.list.make<lua.Statement>();
}

import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";

export function transformThisKeyword(state: TransformState, node: ts.ThisExpression) {
	return lua.globals.self;
}

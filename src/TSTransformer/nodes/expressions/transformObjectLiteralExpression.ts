import { TransformState } from "TSTransformer/TransformState";
import ts from "typescript";
import * as lua from "LuaAST";

export function transformObjectLiteralExpression(state: TransformState, node: ts.ObjectLiteralExpression) {
	return lua.table();
}

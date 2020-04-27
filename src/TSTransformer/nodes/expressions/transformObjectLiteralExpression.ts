import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import ts from "typescript";

export function transformObjectLiteralExpression(state: TransformState, node: ts.ObjectLiteralExpression) {
	return lua.table();
}

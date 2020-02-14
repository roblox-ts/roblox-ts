import ts from "typescript";
import * as lua from "LuaAST";

export interface ExpressionWithType<T extends lua.Expression = lua.Expression> {
	expression: T;
	type: ts.Type;
}

import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";

export function transformArrayBindingPattern(
	state: TransformState,
	bindingPattern: ts.ArrayBindingPattern,
	parentId: lua.Identifier,
	noLocal: boolean,
) {
	const index = 1;
}

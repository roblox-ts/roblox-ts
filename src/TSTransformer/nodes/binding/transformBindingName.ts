import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";

export function transformBindingName(
	state: TransformState,
	name: ts.BindingName,
	initializers: lua.List<lua.Statement>,
) {
	let id: lua.AnyIdentifier;
	if (ts.isIdentifier(name)) {
		id = transformIdentifierDefined(state, name);
	} else {
		id = lua.tempId();
		lua.list.pushList(
			initializers,
			state.capturePrereqs(() => {
				if (ts.isArrayBindingPattern(name)) {
					transformArrayBindingPattern(state, name, id);
				} else {
					transformObjectBindingPattern(state, name, id);
				}
			}),
		);
	}
	return id;
}

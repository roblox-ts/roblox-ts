import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";

export function transformBindingName(
	state: TransformState,
	name: ts.BindingName,
	initializers: luau.List<luau.Statement>,
) {
	let id: luau.AnyIdentifier;
	if (ts.isIdentifier(name)) {
		id = transformIdentifierDefined(state, name);
	} else {
		id = luau.tempId();
		luau.list.pushList(
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

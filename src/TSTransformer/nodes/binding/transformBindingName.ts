import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import ts from "typescript";

export function transformBindingName(
	state: TransformState,
	name: ts.BindingName,
	initializers: luau.List<luau.Statement>,
) {
	let id: luau.AnyIdentifier;
	if (ts.isIdentifier(name)) {
		id = transformIdentifierDefined(state, name);
	} else {
		id = luau.tempId("binding");
		const bindingPrereqs = new Prereqs();
		if (ts.isArrayBindingPattern(name)) {
			transformArrayBindingPattern(state, bindingPrereqs, name, id);
		} else {
			transformObjectBindingPattern(state, bindingPrereqs, name, id);
		}
		luau.list.pushList(initializers, bindingPrereqs.statements);
	}
	return id;
}

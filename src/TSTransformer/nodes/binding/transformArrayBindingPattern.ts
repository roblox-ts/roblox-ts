import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import { getSpreadDestructorForType } from "TSTransformer/util/spreadDestructuring";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformArrayBindingPattern(
	state: TransformState,
	prereqs: Prereqs,
	bindingPattern: ts.ArrayBindingPattern,
	parentId: luau.AnyIdentifier,
) {
	validateNotAnyType(state, bindingPattern);

	let index = 0;
	const idStack = new Array<luau.AnyIdentifier>();
	const accessor = getAccessorForBindingType(state, bindingPattern, state.getType(bindingPattern));
	const destructor = getSpreadDestructorForType(state, bindingPattern, state.getType(bindingPattern));

	for (const element of bindingPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(prereqs, parentId, index, idStack, true);
		} else {
			const name = element.name;

			const isSpreadElement = element.dotDotDotToken !== undefined;
			const value = isSpreadElement
				? destructor(prereqs, parentId, index, idStack)
				: accessor(prereqs, parentId, index, idStack, false);

			if (ts.isIdentifier(name)) {
				const id = transformVariable(state, prereqs, name, value);
				if (element.initializer) {
					prereqs.push(transformInitializer(state, id, element.initializer));
				}
			} else {
				const id = prereqs.pushToVar(value, "binding");
				if (element.initializer) {
					prereqs.push(transformInitializer(state, id, element.initializer));
				}
				if (ts.isArrayBindingPattern(name)) {
					transformArrayBindingPattern(state, prereqs, name, id);
				} else {
					transformObjectBindingPattern(state, prereqs, name, id);
				}
			}
		}
		index++;
	}
}

import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { createObjectRest } from "TSTransformer/util/binding/createObjectRest";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformObjectBindingPattern(
	state: TransformState,
	prereqs: Prereqs,
	bindingPattern: ts.ObjectBindingPattern,
	parentId: luau.AnyIdentifier,
) {
	validateNotAnyType(state, bindingPattern);
	const keys = new Array<luau.Expression>();
	const type = state.getType(bindingPattern);
	for (const element of bindingPattern.elements) {
		const name = element.name;
		const prop = element.propertyName;
		const isSpread = element.dotDotDotToken !== undefined;

		if (ts.isIdentifier(name)) {
			let value: luau.Expression;
			if (isSpread) {
				value = createObjectRest(state, prereqs, element, type, parentId, keys);
			} else {
				const access = objectAccessor(state, prereqs, parentId, type, prop ?? name);
				keys.push(access.key);
				value = access.value;
			}

			const id = transformVariable(state, prereqs, name, value);
			if (element.initializer) {
				prereqs.push(transformInitializer(state, id, element.initializer));
			}
		} else {
			// if name is not identifier, it must be a binding pattern
			// in that case, prop is guaranteed to exist
			assert(prop);
			assert(!isSpread);
			const { key, value } = objectAccessor(state, prereqs, parentId, type, prop);
			keys.push(key);

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
}

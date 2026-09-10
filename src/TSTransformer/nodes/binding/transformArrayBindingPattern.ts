import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import { effectsCommute, getEffects, UNKNOWN_EFFECTS } from "TSTransformer/util/evaluation/effects";
import { getSpreadDestructorForType } from "TSTransformer/util/spreadDestructuring";
import { isDefinitelyType, isIterableFunctionType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformArrayBindingPattern(
	state: TransformState,
	prereqs: Prereqs,
	bindingPattern: ts.ArrayBindingPattern,
	parentId: luau.AnyIdentifier,
) {
	validateNotAnyType(state, bindingPattern);

	const type = state.getType(bindingPattern);
	if (
		isDefinitelyType(type, isIterableFunctionType(state)) &&
		!effectsCommute(getEffects(parentId), UNKNOWN_EFFECTS)
	) {
		// advancing an iterator can rebind its source before later elements read it
		parentId = prereqs.pushToVar(parentId, "iterator");
	}

	let index = 0;
	const idStack = new Array<luau.AnyIdentifier>();
	const hasRest = bindingPattern.elements.some(element => ts.isBindingElement(element) && element.dotDotDotToken);
	const accessor = getAccessorForBindingType(state, bindingPattern, type, hasRest);
	const destructor = getSpreadDestructorForType(state, bindingPattern, type);

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

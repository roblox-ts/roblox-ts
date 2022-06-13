import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformObjectBindingPattern(
	state: TransformState,
	bindingPattern: ts.ObjectBindingPattern,
	parentId: luau.AnyIdentifier,
) {
	validateNotAnyType(state, bindingPattern);
	for (const element of bindingPattern.elements) {
		if (element.dotDotDotToken) {
			DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
			return;
		}
		const name = element.name;
		const prop = element.propertyName;
		if (ts.isIdentifier(name)) {
			const value = objectAccessor(state, parentId, state.getType(bindingPattern), prop ?? name);
			const id = transformVariable(state, name, value);
			if (element.initializer) {
				state.prereq(transformInitializer(state, id, element.initializer));
			}
		} else {
			// if name is not identifier, it must be a binding pattern
			// in that case, prop is guaranteed to exist
			assert(prop);
			const value = objectAccessor(state, parentId, state.getType(bindingPattern), prop);
			const id = state.pushToVar(value, "binding");
			if (element.initializer) {
				state.prereq(transformInitializer(state, id, element.initializer));
			}
			if (ts.isArrayBindingPattern(name)) {
				transformArrayBindingPattern(state, name, id);
			} else {
				transformObjectBindingPattern(state, name, id);
			}
		}
	}
}

import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { spreadDestructureObject } from "TSTransformer/util/spreadDestructuring";
import { isPossiblyType, isRobloxType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformObjectBindingPattern(
	state: TransformState,
	bindingPattern: ts.ObjectBindingPattern,
	parentId: luau.AnyIdentifier,
) {
	validateNotAnyType(state, bindingPattern);
	const preSpreadNames = new Array<luau.Expression>();
	for (const element of bindingPattern.elements) {
		const name = element.name;
		const prop = element.propertyName;
		const isSpread = element.dotDotDotToken !== undefined;

		if (ts.isIdentifier(name)) {
			const value = isSpread
				? spreadDestructureObject(state, parentId, preSpreadNames)
				: objectAccessor(state, parentId, state.getType(bindingPattern), prop ?? name);
			preSpreadNames.push(value);

			if (isSpread && isPossiblyType(state.getType(bindingPattern), isRobloxType(state))) {
				DiagnosticService.addDiagnostic(errors.noRestSpreadingOfRobloxTypes(element));
				continue;
			}

			const id = transformVariable(state, name, value);
			if (element.initializer) {
				state.prereq(transformInitializer(state, id, element.initializer));
			}
		} else {
			// if name is not identifier, it must be a binding pattern
			// in that case, prop is guaranteed to exist
			assert(prop);
			assert(!isSpread);
			const value = objectAccessor(state, parentId, state.getType(bindingPattern), prop);
			preSpreadNames.push(value);

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

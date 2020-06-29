import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformObjectBindingPattern(
	state: TransformState,
	bindingPattern: ts.ObjectBindingPattern,
	parentId: luau.AnyIdentifier,
) {
	validateNotAnyType(state, bindingPattern);
	const accessType = state.getType(bindingPattern);

	for (const element of bindingPattern.elements) {
		if (element.dotDotDotToken) {
			state.addDiagnostic(diagnostics.noSpreadDestructuring(element));
			return;
		}
		const name = element.name;
		const prop = element.propertyName;
		if (ts.isIdentifier(name)) {
			const value = objectAccessor(state, parentId, accessType, prop ?? name);
			const [id, prereqs] = transformVariable(state, name, value);
			state.prereqList(prereqs);
			if (element.initializer) {
				state.prereq(transformInitializer(state, id, element.initializer));
			}
		} else {
			const value = objectAccessor(state, parentId, accessType, prop ?? name);
			const id = state.pushToVar(value);
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

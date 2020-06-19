import ts from "byots";
import * as lua from "LuaAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";

export function transformObjectBindingPattern(
	state: TransformState,
	bindingPattern: ts.ObjectBindingPattern,
	parentId: lua.AnyIdentifier,
) {
	for (const element of bindingPattern.elements) {
		if (element.dotDotDotToken) {
			state.addDiagnostic(diagnostics.noSpreadDestructuring(element));
			return;
		}
		const name = element.name;
		const prop = element.propertyName;
		if (ts.isIdentifier(name)) {
			const value = objectAccessor(state, parentId, name, prop, name);
			const { expression: id, statements } = transformVariable(state, name, value);
			state.prereqList(statements);
			assert(lua.isAnyIdentifier(id), "transformVariable did not return an identifier as expression");
			if (element.initializer) {
				state.prereq(transformInitializer(state, id, element.initializer));
			}
		} else {
			const value = objectAccessor(state, parentId, name, prop, name);
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

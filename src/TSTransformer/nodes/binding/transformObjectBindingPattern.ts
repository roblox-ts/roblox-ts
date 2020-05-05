import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { diagnostics } from "TSTransformer/diagnostics";
import { transformArrayBindingPattern } from "TSTransformer/nodes/binding/transformArrayBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { transformInitializer } from "TSTransformer/util/transformInitializer";

export function transformObjectBindingPattern(
	state: TransformState,
	bindingPattern: ts.ObjectBindingPattern,
	parentId: lua.AnyIdentifier,
) {
	for (const element of bindingPattern.elements) {
		if (element.dotDotDotToken) {
			state.addDiagnostic(diagnostics.noDotDotDotDestructuring(element));
			return;
		}
		const name = element.name;
		const prop = element.propertyName;
		if (ts.isIdentifier(name)) {
			const value = objectAccessor(state, parentId, name, prop, name);
			const { expression: id, statements } = transformVariable(state, name, value);
			state.prereqList(statements);
			assert(lua.isAnyIdentifier(id));
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

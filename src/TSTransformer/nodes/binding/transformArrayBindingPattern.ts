import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformObjectBindingPattern } from "TSTransformer/nodes/binding/transformObjectBindingPattern";
import { transformVariable } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import ts from "typescript";

export function transformArrayBindingPattern(
	state: TransformState,
	bindingPattern: ts.ArrayBindingPattern,
	parentId: luau.AnyIdentifier,
) {
	let index = 0;
	const idStack = new Array<luau.AnyIdentifier>();
	const accessor = getAccessorForBindingType(state, bindingPattern, state.getType(bindingPattern));
	for (const element of bindingPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(state, parentId, index, idStack, true);
		} else {
			if (element.dotDotDotToken) {
				DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
				return;
			}
			const name = element.name;
			const value = accessor(state, parentId, index, idStack, false);
			if (ts.isIdentifier(name)) {
				const [id, prereqs] = transformVariable(state, name, value);
				state.prereqList(prereqs);
				if (element.initializer) {
					state.prereq(transformInitializer(state, id, element.initializer));
				}
			} else {
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
		index++;
	}
}

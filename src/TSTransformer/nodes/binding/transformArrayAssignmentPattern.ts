import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformAssignmentPatternElement } from "TSTransformer/nodes/binding/transformAssignmentPatternElement";
import { createArrayBindingAccessor } from "TSTransformer/util/binding/createArrayBindingAccessor";
import { getAssignmentPatternType } from "TSTransformer/util/binding/getAssignmentPatternType";
import ts from "typescript";

export function transformArrayAssignmentPattern(
	state: TransformState,
	prereqs: Prereqs,
	assignmentPattern: ts.ArrayLiteralExpression,
	parentId: luau.AnyIdentifier,
) {
	const type = getAssignmentPatternType(state, assignmentPattern);
	const accessor = createArrayBindingAccessor(state, prereqs, assignmentPattern, type, parentId);
	for (let index = 0; index < assignmentPattern.elements.length; index++) {
		const element = assignmentPattern.elements[index];
		if (ts.isOmittedExpression(element)) {
			accessor.read(prereqs, index, true);
			continue;
		}

		const valuePrereqs = new Prereqs();
		const spread = ts.isSpreadElement(element);
		const value = spread ? accessor.rest(valuePrereqs, index) : accessor.read(valuePrereqs, index, false);
		transformAssignmentPatternElement(state, prereqs, spread ? element.expression : element, valuePrereqs, value);
	}
}

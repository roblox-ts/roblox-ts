import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformAssignmentPatternElement } from "TSTransformer/nodes/binding/transformAssignmentPatternElement";
import { createObjectRest } from "TSTransformer/util/binding/createObjectRest";
import { getAssignmentPatternType } from "TSTransformer/util/binding/getAssignmentPatternType";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { getKindName } from "TSTransformer/util/getKindName";
import ts from "typescript";

export function transformObjectAssignmentPattern(
	state: TransformState,
	prereqs: Prereqs,
	assignmentPattern: ts.ObjectLiteralExpression,
	parentId: luau.AnyIdentifier,
) {
	const type = getAssignmentPatternType(state, assignmentPattern);
	const keys = new Array<luau.Expression>();
	for (const property of assignmentPattern.properties) {
		const valuePrereqs = new Prereqs();
		if (ts.isSpreadAssignment(property)) {
			const value = createObjectRest(state, valuePrereqs, property, type, parentId, keys);
			transformAssignmentPatternElement(state, prereqs, property.expression, valuePrereqs, value);
		} else {
			assert(
				ts.isShorthandPropertyAssignment(property) || ts.isPropertyAssignment(property),
				`Invalid object assignment property: ${getKindName(property.kind)}`,
			);
			// evaluate the property key before the destination, then read the value after it
			const { key, value } = objectAccessor(state, prereqs, parentId, type, property.name);
			keys.push(key);
			const shorthand = ts.isShorthandPropertyAssignment(property);
			transformAssignmentPatternElement(
				state,
				prereqs,
				shorthand ? property.name : property.initializer,
				valuePrereqs,
				value,
				shorthand ? property.objectAssignmentInitializer : undefined,
			);
		}
	}
}

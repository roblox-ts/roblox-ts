import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformObjectAssignmentPattern } from "TSTransformer/nodes/binding/transformObjectAssignmentPattern";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import { getKindName } from "TSTransformer/util/getKindName";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformArrayAssignmentPattern(
	state: TransformState,
	assignmentPattern: ts.ArrayLiteralExpression,
	parentId: luau.AnyIdentifier,
) {
	let index = 0;
	const idStack = new Array<luau.Identifier>();
	const accessor = getAccessorForBindingType(
		state,
		assignmentPattern,
		state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern),
	);
	for (let element of assignmentPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(state, parentId, index, idStack, true);
		} else if (ts.isSpreadElement(element)) {
			DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(element));
		} else {
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(element)) {
				initializer = skipDownwards(element.right);
				element = skipDownwards(element.left);
			}

			const value = accessor(state, parentId, index, idStack, false);
			if (
				ts.isIdentifier(element) ||
				ts.isElementAccessExpression(element) ||
				ts.isPropertyAccessExpression(element)
			) {
				const id = transformWritableExpression(state, element, initializer !== undefined);
				state.prereq(
					luau.create(luau.SyntaxKind.Assignment, {
						left: id,
						operator: "=",
						right: value,
					}),
				);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
			} else if (ts.isArrayLiteralExpression(element)) {
				const id = state.pushToVar(value, "binding");
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformArrayAssignmentPattern(state, element, id);
			} else if (ts.isObjectLiteralExpression(element)) {
				const id = state.pushToVar(value, "binding");
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformObjectAssignmentPattern(state, element, id);
			} else {
				assert(false, `transformArrayAssignmentPattern invalid element: ${getKindName(element.kind)}`);
			}
		}
		index++;
	}
}

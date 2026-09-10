import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformObjectAssignmentPattern } from "TSTransformer/nodes/binding/transformObjectAssignmentPattern";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { captureWritableAssignmentTarget, transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import { getEffects } from "TSTransformer/util/evaluation/effects";
import { getKindName } from "TSTransformer/util/getKindName";
import { getSpreadDestructorForType } from "TSTransformer/util/spreadDestructuring";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformArrayAssignmentPattern(
	state: TransformState,
	prereqs: Prereqs,
	assignmentPattern: ts.ArrayLiteralExpression,
	parentId: luau.AnyIdentifier,
) {
	let index = 0;
	const idStack = new Array<luau.Identifier>();
	const patternType = state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern);

	const accessor = getAccessorForBindingType(state, assignmentPattern, patternType);
	const destructor = getSpreadDestructorForType(state, assignmentPattern, patternType);

	for (let element of assignmentPattern.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(prereqs, parentId, index, idStack, true);
		} else {
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(element)) {
				initializer = skipDownwards(element.right);
				element = skipDownwards(element.left);
			}

			const valuePrereqs = new Prereqs();
			const value = ts.isSpreadElement(element)
				? destructor(valuePrereqs, parentId, index, idStack)
				: accessor(valuePrereqs, parentId, index, idStack, false);

			// diagnostic is needed because getTypeOfAssignmentPattern is implemented incorrectly:
			// it errors, if that parent of node being passed in is ts.SpreadElement
			if (
				ts.isSpreadElement(element) &&
				(ts.isObjectLiteralExpression(element.expression) || ts.isArrayLiteralExpression(element.expression))
			) {
				DiagnosticService.addDiagnostic(errors.noNestedSpreadsInAssignmentPatterns(element.parent));
				continue;
			}

			if (
				ts.isIdentifier(element) ||
				ts.isElementAccessExpression(element) ||
				ts.isPropertyAccessExpression(element) ||
				ts.isSpreadElement(element)
			) {
				let id = transformWritableExpression(
					state,
					prereqs,
					ts.isSpreadElement(element) ? element.expression : element,
					initializer !== undefined,
				);
				id = captureWritableAssignmentTarget(
					prereqs,
					id,
					getEffects(valuePrereqs.statements),
					getEffects(value),
				);
				prereqs.pushList(valuePrereqs.statements);
				prereqs.push(
					luau.create(luau.SyntaxKind.Assignment, {
						left: id,
						operator: "=",
						right: value,
					}),
				);
				if (initializer) {
					prereqs.push(transformInitializer(state, id, initializer));
				}
			} else if (ts.isArrayLiteralExpression(element)) {
				prereqs.pushList(valuePrereqs.statements);
				const id = prereqs.pushToVar(value, "binding");
				if (initializer) {
					prereqs.push(transformInitializer(state, id, initializer));
				}
				transformArrayAssignmentPattern(state, prereqs, element, id);
			} else if (ts.isObjectLiteralExpression(element)) {
				prereqs.pushList(valuePrereqs.statements);
				const id = prereqs.pushToVar(value, "binding");
				if (initializer) {
					prereqs.push(transformInitializer(state, id, initializer));
				}
				transformObjectAssignmentPattern(state, prereqs, element, id);
			} else {
				assert(false, `transformArrayAssignmentPattern invalid element: ${getKindName(element.kind)}`);
			}
		}
		index++;
	}
}

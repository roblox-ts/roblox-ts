import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformArrayAssignmentPattern } from "TSTransformer/nodes/binding/transformArrayAssignmentPattern";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { getKindName } from "TSTransformer/util/getKindName";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformObjectAssignmentPattern(
	state: TransformState,
	assignmentPattern: ts.ObjectLiteralExpression,
	parentId: luau.AnyIdentifier,
) {
	for (const property of assignmentPattern.properties) {
		if (ts.isShorthandPropertyAssignment(property)) {
			const name = property.name;
			const value = objectAccessor(
				state,
				parentId,
				state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern),
				name,
			);
			const id = transformWritableExpression(state, name, property.objectAssignmentInitializer !== undefined);
			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: id,
					operator: "=",
					right: value,
				}),
			);
			assert(luau.isAnyIdentifier(id));
			if (property.objectAssignmentInitializer) {
				state.prereq(transformInitializer(state, id, property.objectAssignmentInitializer));
			}
		} else if (ts.isSpreadAssignment(property)) {
			DiagnosticService.addDiagnostic(errors.noSpreadDestructuring(property));
			return;
		} else if (ts.isPropertyAssignment(property)) {
			const name = property.name;
			let init = property.initializer;
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(property.initializer)) {
				initializer = skipDownwards(property.initializer.right);
				init = skipDownwards(property.initializer.left);
			}

			const value = objectAccessor(
				state,
				parentId,
				state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern),
				name,
			);
			if (ts.isIdentifier(init) || ts.isElementAccessExpression(init) || ts.isPropertyAccessExpression(init)) {
				const id = transformWritableExpression(state, init, initializer !== undefined);
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
			} else if (ts.isArrayLiteralExpression(init)) {
				const id = state.pushToVar(value, "binding");
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				assert(ts.isIdentifier(name));
				transformArrayAssignmentPattern(state, init, id);
			} else if (ts.isObjectLiteralExpression(init)) {
				const id = state.pushToVar(value, "binding");
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformObjectAssignmentPattern(state, init, id);
			} else {
				assert(false, `transformObjectAssignmentPattern invalid initializer: ${getKindName(init.kind)}`);
			}
		} else {
			assert(false, `transformObjectAssignmentPattern invalid property: ${getKindName(property.kind)}`);
		}
	}
}

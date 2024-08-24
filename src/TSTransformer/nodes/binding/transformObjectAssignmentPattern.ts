import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformArrayAssignmentPattern } from "TSTransformer/nodes/binding/transformArrayAssignmentPattern";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { getKindName } from "TSTransformer/util/getKindName";
import { spreadDestructObject } from "TSTransformer/util/spreadDestruction";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformObjectAssignmentPattern(
	state: TransformState,
	assignmentPattern: ts.ObjectLiteralExpression,
	parentId: luau.AnyIdentifier,
	type?: ts.Type,
) {
	const preSpreadNames = new Array<luau.Expression>();
	for (const property of assignmentPattern.properties) {
		if (ts.isShorthandPropertyAssignment(property)) {
			const name = property.name;
			const value = objectAccessor(
				state,
				parentId,
				type ?? state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern),
				name,
			);
			preSpreadNames.push(value);
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
			const value = spreadDestructObject(state, parentId, preSpreadNames);
			const expression = property.expression;
			const passedType = type ?? state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern);

			if (
				ts.isIdentifier(expression) ||
				ts.isElementAccessExpression(expression) ||
				ts.isPropertyAccessExpression(expression)
			) {
				const id = transformWritableExpression(state, expression, true);
				state.prereq(
					luau.create(luau.SyntaxKind.Assignment, {
						left: id,
						operator: "=",
						right: value,
					}),
				);
			} else if (ts.isObjectLiteralExpression(expression)) {
				/** errors when we call this recursively without passing down the type,
				 * because of incorrect impl of typeChecker.getTypeOfAssignmentPattern.
				 * it can't handle an assignment pattern if the parent is a spreadElement*/
				transformObjectAssignmentPattern(state, expression, value, passedType);
			} else if (ts.isArrayLiteralExpression(expression)) {
				transformArrayAssignmentPattern(state, expression, value);
			} else {
				assert(
					false,
					"transformObjectAssignmentPattern unexpected expression type: " + getKindName(expression.kind),
				);
			}
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
				type ?? state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern),
				name,
			);
			preSpreadNames.push(value);
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

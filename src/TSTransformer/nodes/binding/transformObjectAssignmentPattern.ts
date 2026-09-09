import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformArrayAssignmentPattern } from "TSTransformer/nodes/binding/transformArrayAssignmentPattern";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { getKindName } from "TSTransformer/util/getKindName";
import { spreadDestructureObject } from "TSTransformer/util/spreadDestructuring";
import { skipDownwards } from "TSTransformer/util/traversal";
import ts from "typescript";

export function transformObjectAssignmentPattern(
	state: TransformState,
	prereqs: Prereqs,
	assignmentPattern: ts.ObjectLiteralExpression,
	parentId: luau.AnyIdentifier,
) {
	const patternType = state.typeChecker.getTypeOfAssignmentPattern(assignmentPattern);
	const preSpreadNames = new Array<luau.Expression>();
	for (const property of assignmentPattern.properties) {
		if (ts.isShorthandPropertyAssignment(property)) {
			const name = property.name;
			const value = objectAccessor(state, prereqs, parentId, patternType, name);
			preSpreadNames.push(value);

			const id = transformWritableExpression(
				state,
				prereqs,
				name,
				property.objectAssignmentInitializer !== undefined,
			);
			prereqs.push(
				luau.create(luau.SyntaxKind.Assignment, {
					left: id,
					operator: "=",
					right: value,
				}),
			);
			assert(luau.isAnyIdentifier(id));
			if (property.objectAssignmentInitializer) {
				prereqs.push(transformInitializer(state, id, property.objectAssignmentInitializer));
			}
		} else if (ts.isSpreadAssignment(property)) {
			const value = spreadDestructureObject(prereqs, parentId, preSpreadNames);
			const expression = property.expression;

			// diagnostic is needed because getTypeOfAssignmentPattern is implemented incorrectly:
			// it errors, if that parent of node being passed in is ts.SpreadElement
			if (ts.isObjectLiteralExpression(expression) || ts.isArrayLiteralExpression(expression)) {
				DiagnosticService.addDiagnostic(errors.noNestedSpreadsInAssignmentPatterns(property));
				continue;
			}

			assert(
				ts.isIdentifier(expression),
				"transformObjectAssignmentPattern unexpected expression type: " + getKindName(expression.kind),
			);
			const id = transformWritableExpression(state, prereqs, expression, true);
			prereqs.push(
				luau.create(luau.SyntaxKind.Assignment, {
					left: id,
					operator: "=",
					right: value,
				}),
			);
		} else if (ts.isPropertyAssignment(property)) {
			const name = property.name;
			let init = property.initializer;
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(property.initializer)) {
				initializer = skipDownwards(property.initializer.right);
				init = skipDownwards(property.initializer.left);
			}

			const value = objectAccessor(state, prereqs, parentId, patternType, name);
			preSpreadNames.push(value);

			if (ts.isIdentifier(init) || ts.isElementAccessExpression(init) || ts.isPropertyAccessExpression(init)) {
				const id = transformWritableExpression(state, prereqs, init, initializer !== undefined);
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
			} else if (ts.isArrayLiteralExpression(init)) {
				const id = prereqs.pushToVar(value, "binding");
				if (initializer) {
					prereqs.push(transformInitializer(state, id, initializer));
				}
				assert(ts.isIdentifier(name));
				transformArrayAssignmentPattern(state, prereqs, init, id);
			} else if (ts.isObjectLiteralExpression(init)) {
				const id = prereqs.pushToVar(value, "binding");
				if (initializer) {
					prereqs.push(transformInitializer(state, id, initializer));
				}
				transformObjectAssignmentPattern(state, prereqs, init, id);
			} else {
				assert(false, `transformObjectAssignmentPattern invalid initializer: ${getKindName(init.kind)}`);
			}
		} else {
			assert(false, `transformObjectAssignmentPattern invalid property: ${getKindName(property.kind)}`);
		}
	}
}

import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformArrayBindingLiteral } from "TSTransformer/nodes/binding/transformArrayBindingLiteral";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getSubType } from "TSTransformer/util/binding/getSubType";
import { objectAccessor } from "TSTransformer/util/binding/objectAccessor";
import { skipDownwards } from "TSTransformer/util/traversal";

export function transformObjectBindingLiteral(
	state: TransformState,
	bindingLiteral: ts.ObjectLiteralExpression,
	parentId: luau.AnyIdentifier,
	accessType: ts.Type | ReadonlyArray<ts.Type>,
) {
	for (const property of bindingLiteral.properties) {
		if (ts.isShorthandPropertyAssignment(property)) {
			const name = property.name;
			const value = objectAccessor(state, parentId, accessType, name);
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
			state.addDiagnostic(diagnostics.noSpreadDestructuring(property));
			return;
		} else if (ts.isPropertyAssignment(property)) {
			const name = property.name;
			let init = property.initializer;
			let initializer: ts.Expression | undefined;
			if (ts.isBinaryExpression(property.initializer)) {
				initializer = skipDownwards(property.initializer.right);
				init = skipDownwards(property.initializer.left);
			}

			const value = objectAccessor(state, parentId, accessType, name);
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
				const id = state.pushToVar(value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				assert(ts.isIdentifier(name));
				transformArrayBindingLiteral(state, init, id, getSubType(state, accessType, name.text));
			} else if (ts.isObjectLiteralExpression(init)) {
				const id = state.pushToVar(value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				assert(ts.isIdentifier(name));
				transformObjectBindingLiteral(state, init, id, getSubType(state, accessType, name.text));
			} else {
				assert(false);
			}
		} else {
			assert(false);
		}
	}
}

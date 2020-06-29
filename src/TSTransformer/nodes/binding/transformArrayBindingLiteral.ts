import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformObjectBindingLiteral } from "TSTransformer/nodes/binding/transformObjectBindingLiteral";
import { transformInitializer } from "TSTransformer/nodes/transformInitializer";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { getAccessorForBindingType } from "TSTransformer/util/binding/getAccessorForBindingType";
import { getSubType } from "TSTransformer/util/binding/getSubType";
import { skipDownwards } from "TSTransformer/util/traversal";

export function transformArrayBindingLiteral(
	state: TransformState,
	bindingLiteral: ts.ArrayLiteralExpression,
	parentId: luau.AnyIdentifier,
	accessType: ts.Type | ReadonlyArray<ts.Type>,
) {
	let index = 0;
	const idStack = new Array<luau.Identifier>();
	const accessor = getAccessorForBindingType(state, bindingLiteral, accessType);
	for (let element of bindingLiteral.elements) {
		if (ts.isOmittedExpression(element)) {
			accessor(state, parentId, index, idStack, true);
		} else if (ts.isSpreadElement(element)) {
			state.addDiagnostic(diagnostics.noSpreadDestructuring(element));
			return;
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
				const id = state.pushToVar(value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformArrayBindingLiteral(state, element, id, getSubType(state, accessType, index));
			} else if (ts.isObjectLiteralExpression(element)) {
				const id = state.pushToVar(value);
				if (initializer) {
					state.prereq(transformInitializer(state, id, initializer));
				}
				transformObjectBindingLiteral(state, element, id, getSubType(state, accessType, index));
			} else {
				assert(false);
			}
		}
		index++;
	}
}

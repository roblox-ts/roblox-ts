import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { createArrayPointer, disableArrayInline } from "TSTransformer/util/pointer";
import ts from "typescript";

export function transformArrayLiteralExpression(state: TransformState, node: ts.ArrayLiteralExpression) {
	if (!node.elements.find(element => ts.isSpreadElement(element))) {
		return luau.array(ensureTransformOrder(state, node.elements));
	}

	const ptr = createArrayPointer("array");
	const lengthId = luau.tempId("length");
	let lengthInitialized = false;
	let amtElementsSinceUpdate = 0;

	function updateLengthId() {
		const right = luau.unary("#", ptr.value);
		if (lengthInitialized) {
			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: lengthId,
					operator: "=",
					right,
				}),
			);
		} else {
			state.prereq(
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: lengthId,
					right,
				}),
			);
			lengthInitialized = true;
		}
		amtElementsSinceUpdate = 0;
	}

	for (let i = 0; i < node.elements.length; i++) {
		const element = node.elements[i];
		if (ts.isSpreadElement(element)) {
			if (luau.isArray(ptr.value)) {
				disableArrayInline(state, ptr);
				updateLengthId();
			}
			assert(luau.isAnyIdentifier(ptr.value));

			const type = state.getType(element.expression);
			const addIterableToArrayBuilder = getAddIterableToArrayBuilder(state, element.expression, type);
			const spreadExp = transformExpression(state, element.expression);
			const shouldUpdateLengthId = i < node.elements.length - 1;
			state.prereqList(
				addIterableToArrayBuilder(
					state,
					spreadExp,
					ptr.value,
					lengthId,
					amtElementsSinceUpdate,
					shouldUpdateLengthId,
				),
			);
		} else {
			const [expression, prereqs] = state.capture(() => transformExpression(state, element));
			if (luau.isArray(ptr.value) && !luau.list.isEmpty(prereqs)) {
				disableArrayInline(state, ptr);
				updateLengthId();
			}
			if (luau.isArray(ptr.value)) {
				luau.list.push(ptr.value.members, expression);
			} else {
				state.prereqList(prereqs);
				state.prereq(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: ptr.value,
							index: luau.binary(lengthId, "+", luau.number(amtElementsSinceUpdate + 1)),
						}),
						operator: "=",
						right: expression,
					}),
				);
			}
			amtElementsSinceUpdate++;
		}
	}

	return ptr.value;
}

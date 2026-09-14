import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { createArrayPointer, disableArrayInline } from "TSTransformer/util/pointer";
import ts from "typescript";

export function transformArrayLiteralExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.ArrayLiteralExpression,
) {
	if (!node.elements.find(element => ts.isSpreadElement(element))) {
		return luau.array(ensureTransformOrder(state, prereqs, node.elements));
	}

	const ptr = createArrayPointer("array");
	const lengthId = luau.tempId("length");
	let amtElementsSinceUpdate = 0;

	// the array pointer becomes an identifier once, when inline construction ends
	function initializeLengthId() {
		prereqs.push(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: lengthId,
				right: luau.unary("#", ptr.value),
			}),
		);
		amtElementsSinceUpdate = 0;
	}

	for (let i = 0; i < node.elements.length; i++) {
		const element = node.elements[i];
		if (ts.isSpreadElement(element)) {
			if (luau.isArray(ptr.value)) {
				disableArrayInline(prereqs, ptr);
				initializeLengthId();
			}
			assert(luau.isAnyIdentifier(ptr.value));

			const type = state.getType(element.expression);
			const addIterableToArrayBuilder = getAddIterableToArrayBuilder(state, element.expression, type);
			const spreadExp = transformExpression(state, prereqs, element.expression);
			const shouldUpdateLengthId = i < node.elements.length - 1;
			prereqs.pushList(
				addIterableToArrayBuilder(
					prereqs,
					spreadExp,
					ptr.value,
					lengthId,
					amtElementsSinceUpdate,
					shouldUpdateLengthId,
				),
			);
		} else {
			const expressionPrereqs = new Prereqs();
			const expression = transformExpression(state, expressionPrereqs, element);
			if (luau.isArray(ptr.value) && !luau.list.isEmpty(expressionPrereqs.statements)) {
				disableArrayInline(prereqs, ptr);
				initializeLengthId();
			}
			if (luau.isArray(ptr.value)) {
				luau.list.push(ptr.value.members, expression);
			} else {
				prereqs.pushList(expressionPrereqs.statements);
				prereqs.push(
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

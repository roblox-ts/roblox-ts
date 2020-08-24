import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { createArrayPointer, disableArrayInline } from "TSTransformer/util/pointer";
import { isArrayType } from "TSTransformer/util/types";

export function transformArrayLiteralExpression(state: TransformState, node: ts.ArrayLiteralExpression) {
	if (!node.elements.find(element => ts.isSpreadElement(element))) {
		return luau.create(luau.SyntaxKind.Array, {
			members: luau.list.make(...ensureTransformOrder(state, node.elements)),
		});
	}

	const ptr = createArrayPointer();
	const lengthId = luau.tempId();
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
			assert(isArrayType(state, state.getType(element.expression)));
			if (luau.isArray(ptr.value)) {
				disableArrayInline(state, ptr);
				updateLengthId();
			}
			assert(luau.isAnyIdentifier(ptr.value));
			const spreadExp = transformExpression(state, element.expression);
			const keyId = luau.tempId();
			const valueId = luau.tempId();
			state.prereq(
				luau.create(luau.SyntaxKind.ForStatement, {
					ids: luau.list.make(keyId, valueId),
					expression: luau.create(luau.SyntaxKind.CallExpression, {
						expression: luau.globals.ipairs,
						args: luau.list.make(spreadExp),
					}),
					statements: luau.list.make(
						luau.create(luau.SyntaxKind.Assignment, {
							left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
								expression: ptr.value,
								index: luau.binary(lengthId, "+", keyId),
							}),
							operator: "=",
							right: valueId,
						}),
					),
				}),
			);
			if (i < node.elements.length - 1) {
				updateLengthId();
			}
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

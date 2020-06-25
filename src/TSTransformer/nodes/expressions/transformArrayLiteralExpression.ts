import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isArrayType } from "TSTransformer/util/types";
import { createArrayPointer, disableArrayInline } from "TSTransformer/util/pointer";

export function transformArrayLiteralExpression(state: TransformState, node: ts.ArrayLiteralExpression) {
	if (!node.elements.find(element => ts.isSpreadElement(element))) {
		return lua.create(lua.SyntaxKind.Array, {
			members: lua.list.make(...ensureTransformOrder(state, node.elements)),
		});
	}

	const ptr = createArrayPointer();
	const lengthId = lua.tempId();
	let lengthInitialized = false;
	let amtElementsSinceUpdate = 0;

	function updateLengthId() {
		state.prereq(
			lua.create(lengthInitialized ? lua.SyntaxKind.Assignment : lua.SyntaxKind.VariableDeclaration, {
				left: lengthId,
				right: lua.unary("#", ptr.value),
			}),
		);
		if (!lengthInitialized) {
			lengthInitialized = true;
		}
		amtElementsSinceUpdate = 0;
	}

	for (let i = 0; i < node.elements.length; i++) {
		const element = node.elements[i];
		if (ts.isSpreadElement(element)) {
			assert(isArrayType(state, state.getType(element.expression)));
			if (lua.isArray(ptr.value)) {
				disableArrayInline(state, ptr);
				updateLengthId();
			}
			assert(lua.isAnyIdentifier(ptr.value));
			const spreadExp = transformExpression(state, element.expression);
			const keyId = lua.tempId();
			const valueId = lua.tempId();
			state.prereq(
				lua.create(lua.SyntaxKind.ForStatement, {
					ids: lua.list.make(keyId, valueId),
					expression: lua.create(lua.SyntaxKind.CallExpression, {
						expression: lua.globals.ipairs,
						args: lua.list.make(spreadExp),
					}),
					statements: lua.list.make(
						lua.create(lua.SyntaxKind.Assignment, {
							left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
								expression: ptr.value,
								index: lua.binary(lengthId, "+", keyId),
							}),
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
			if (lua.isArray(ptr.value) && !lua.list.isEmpty(prereqs)) {
				disableArrayInline(state, ptr);
				updateLengthId();
			}
			if (lua.isArray(ptr.value)) {
				lua.list.push(ptr.value.members, expression);
			} else {
				state.prereqList(prereqs);
				state.prereq(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: ptr.value,
							index: lua.binary(lengthId, "+", lua.number(amtElementsSinceUpdate + 1)),
						}),
						right: expression,
					}),
				);
			}
			amtElementsSinceUpdate++;
		}
	}

	return ptr.value;
}

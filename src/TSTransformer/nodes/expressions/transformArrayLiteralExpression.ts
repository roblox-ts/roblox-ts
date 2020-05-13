import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { TransformState } from "TSTransformer/TransformState";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { isArrayType } from "TSTransformer/util/types";

export function transformArrayLiteralExpression(state: TransformState, node: ts.ArrayLiteralExpression) {
	if (!node.elements.find(element => ts.isSpreadElement(element))) {
		return lua.create(lua.SyntaxKind.Array, {
			members: lua.list.make(...ensureTransformOrder(state, node.elements)),
		});
	}

	let exp: lua.Array | lua.TemporaryIdentifier = lua.array();
	const lengthId = lua.tempId();
	let lengthInitialized = false;
	let amtElementsSinceUpdate = 0;

	function updateLengthId() {
		state.prereq(
			lua.create(lengthInitialized ? lua.SyntaxKind.Assignment : lua.SyntaxKind.VariableDeclaration, {
				left: lengthId,
				right: lua.create(lua.SyntaxKind.UnaryExpression, {
					operator: "#",
					expression: exp,
				}),
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
			if (lua.isArray(exp)) {
				exp = state.pushToVar(exp);
				updateLengthId();
			}
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
								expression: exp,
								index: lua.create(lua.SyntaxKind.BinaryExpression, {
									left: lengthId,
									operator: "+",
									right: keyId,
								}),
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
			const { expression, statements } = state.capture(() => transformExpression(state, element));
			if (lua.isArray(exp) && !lua.list.isEmpty(statements)) {
				exp = state.pushToVar(exp);
				updateLengthId();
			}
			if (lua.isArray(exp)) {
				lua.list.push(exp.members, expression);
			} else {
				state.prereqList(statements);
				state.prereq(
					lua.create(lua.SyntaxKind.Assignment, {
						left: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
							expression: exp,
							index:
								amtElementsSinceUpdate > 0
									? lua.create(lua.SyntaxKind.BinaryExpression, {
											left: lengthId,
											operator: "+",
											right: lua.number(amtElementsSinceUpdate),
									  })
									: lengthId,
						}),
						right: expression,
					}),
				);
			}
			amtElementsSinceUpdate++;
		}
	}

	return exp;
}

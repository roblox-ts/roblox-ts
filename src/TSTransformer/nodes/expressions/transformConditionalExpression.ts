import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { canTypeBeFalsy } from "TSTransformer/util/types";

export function transformConditionalExpression(state: TransformState, node: ts.ConditionalExpression) {
	const condition = transformExpression(state, node.condition);
	const { expression: whenTrue, statements: whenTruePrereqs } = state.capture(() =>
		transformExpression(state, node.whenTrue),
	);
	const { expression: whenFalse, statements: whenFalsePrereqs } = state.capture(() =>
		transformExpression(state, node.whenFalse),
	);
	if (
		!canTypeBeFalsy(state.getType(node.whenTrue)) &&
		lua.list.isEmpty(whenTruePrereqs) &&
		lua.list.isEmpty(whenFalsePrereqs)
	) {
		return lua.create(lua.SyntaxKind.ParenthesizedExpression, {
			expression: lua.create(lua.SyntaxKind.BinaryExpression, {
				left: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: lua.create(lua.SyntaxKind.ParenthesizedExpression, {
						expression: createTruthinessChecks(state, condition, state.getType(node.condition)),
					}),
					right: whenTrue,
					operator: "and",
				}),
				right: whenFalse,
				operator: "or",
			}),
		});
	}

	const tempId = lua.tempId();
	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: tempId,
			right: undefined,
		}),
	);

	lua.list.push(
		whenTruePrereqs,
		lua.create(lua.SyntaxKind.Assignment, {
			left: tempId,
			right: whenTrue,
		}),
	);
	lua.list.push(
		whenFalsePrereqs,
		lua.create(lua.SyntaxKind.Assignment, {
			left: tempId,
			right: whenFalse,
		}),
	);

	state.prereq(
		lua.create(lua.SyntaxKind.IfStatement, {
			condition,
			statements: whenTruePrereqs,
			elseBody: whenFalsePrereqs,
		}),
	);

	return tempId;
}

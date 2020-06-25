import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { canTypeBeLuaFalsy } from "TSTransformer/util/types";

export function transformConditionalExpression(state: TransformState, node: ts.ConditionalExpression) {
	const condition = transformExpression(state, node.condition);
	const [whenTrue, whenTruePrereqs] = state.capture(() => transformExpression(state, node.whenTrue));
	const [whenFalse, whenFalsePrereqs] = state.capture(() => transformExpression(state, node.whenFalse));
	if (
		!canTypeBeLuaFalsy(state, state.getType(node.whenTrue)) &&
		lua.list.isEmpty(whenTruePrereqs) &&
		lua.list.isEmpty(whenFalsePrereqs)
	) {
		let left = createTruthinessChecks(state, condition, state.getType(node.condition));
		if (lua.isBinaryExpression(left)) {
			left = lua.create(lua.SyntaxKind.ParenthesizedExpression, { expression: left });
		}

		return lua.create(lua.SyntaxKind.ParenthesizedExpression, {
			expression: lua.binary(lua.binary(left, "and", whenTrue), "or", whenFalse),
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

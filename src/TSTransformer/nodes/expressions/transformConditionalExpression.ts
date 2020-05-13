import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";

export function transformConditionalExpression(state: TransformState, node: ts.ConditionalExpression) {
	const tempId = lua.tempId();

	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: tempId,
			right: undefined,
		}),
	);

	const condition = createTruthinessChecks(
		state,
		transformExpression(state, node.condition),
		state.getType(node.condition),
	);

	const statements = state.capturePrereqs(() => {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: tempId,
				right: transformExpression(state, node.whenTrue),
			}),
		);
	});

	const elseBody = state.capturePrereqs(() => {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: tempId,
				right: transformExpression(state, node.whenFalse),
			}),
		);
	});

	state.prereq(
		lua.create(lua.SyntaxKind.IfStatement, {
			condition,
			statements,
			elseBody,
		}),
	);

	return tempId;
}

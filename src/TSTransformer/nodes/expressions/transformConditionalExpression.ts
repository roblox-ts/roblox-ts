import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { wrapConditional } from "TSTransformer/util/wrapConditional";
import ts from "typescript";

export function transformConditionalExpression(state: TransformState, node: ts.ConditionalExpression) {
	const tempId = lua.tempId();

	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: tempId,
			right: undefined,
		}),
	);

	const condition = wrapConditional(
		state,
		transformExpression(state, node.condition),
		state.typeChecker.getTypeAtLocation(node.condition),
	);

	const statements = state.statement(() => {
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: tempId,
				right: transformExpression(state, node.whenTrue),
			}),
		);
	});

	const elseBody = state.statement(() => {
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

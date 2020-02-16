import * as lua from "LuaAST";
import { TransformState } from "TSTransformer/TransformState";
import { pushToVar } from "TSTransformer/util/pushToVar";

export function createQuestionDotStatements(
	state: TransformState,
	expression: lua.Expression,
	createIfNotUndefinedExp: (id: lua.TemporaryIdentifier) => lua.Expression,
) {
	const id = pushToVar(state, expression);

	const { expression: ifNotUndefinedExp, statements } = state.capturePrereqs(() => createIfNotUndefinedExp(id));
	lua.list.push(
		statements,
		lua.create(lua.SyntaxKind.Assignment, {
			left: id,
			right: ifNotUndefinedExp,
		}),
	);

	state.prereq(
		lua.create(lua.SyntaxKind.IfStatement, {
			condition: lua.create(lua.SyntaxKind.BinaryExpression, {
				left: id,
				operator: lua.BinaryOperator.TildeEquals,
				right: lua.nil(),
			}),
			statements,
			elseBody: lua.list.make(),
		}),
	);
	return id;
}

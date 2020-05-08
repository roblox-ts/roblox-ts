import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformInitializer(state: TransformState, id: lua.WritableExpression, initializer: ts.Expression) {
	return lua.create(lua.SyntaxKind.IfStatement, {
		condition: lua.create(lua.SyntaxKind.BinaryExpression, {
			left: id,
			operator: "==",
			right: lua.nil(),
		}),
		elseBody: lua.list.make(),
		statements: state.statement(() => {
			state.prereq(
				lua.create(lua.SyntaxKind.Assignment, {
					left: id,
					right: transformExpression(state, initializer),
				}),
			);
		}),
	});
}

import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";

export function createHoistDeclaration(state: TransformState, statement: ts.Statement | ts.CaseClause) {
	const hoists = state.hoistsByStatement.get(statement);
	if (hoists && hoists.length > 0) {
		return lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: lua.list.make(...hoists.map(hoistId => transformIdentifierDefined(state, hoistId))),
			right: undefined,
		});
	}
}

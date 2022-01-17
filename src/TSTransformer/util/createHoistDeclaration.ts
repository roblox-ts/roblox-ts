import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import ts from "typescript";

export function createHoistDeclaration(state: TransformState, statement: ts.Statement | ts.CaseClause) {
	const hoists = state.hoistsByStatement.get(statement);
	if (hoists && hoists.length > 0) {
		hoists.forEach(hoist => validateIdentifier(state, hoist));
		return luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: luau.list.make(...hoists.map(hoistId => transformIdentifierDefined(state, hoistId))),
			right: undefined,
		});
	}
}

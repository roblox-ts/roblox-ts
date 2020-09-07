import luau from "LuauAST";
import { TransformState } from "TSTransformer/classes/TransformState";

export function wrapStatementsAsGenerator(state: TransformState, statements: luau.List<luau.Statement>) {
	return luau.list.make(
		luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: luau.create(luau.SyntaxKind.CallExpression, {
				expression: state.TS("generator"),
				args: luau.list.make(
					luau.create(luau.SyntaxKind.FunctionExpression, {
						hasDotDotDot: false,
						parameters: luau.list.make(),
						statements,
					}),
				),
			}),
		}),
	);
}

import luau from "LuauAST";
import { TransformState } from "TSTransformer/classes/TransformState";

export function wrapStatementsAsGenerator(state: TransformState, statements: luau.List<luau.Statement>) {
	return luau.list.make(
		luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: luau.call(state.TS("generator"), [
				luau.create(luau.SyntaxKind.FunctionExpression, {
					hasDotDotDot: false,
					parameters: luau.list.make(),
					statements,
				}),
			]),
		}),
	);
}

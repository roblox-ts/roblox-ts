import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformThrowStatement(state: TransformState, node: ts.ThrowStatement) {
	const args = luau.list.make<luau.Expression>();
	if (node.expression !== undefined) {
		luau.list.push(args, transformExpression(state, node.expression));
	}

	return luau.list.make(
		luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.create(luau.SyntaxKind.CallExpression, {
				expression: luau.globals.error,
				args,
			}),
		}),
	);
}

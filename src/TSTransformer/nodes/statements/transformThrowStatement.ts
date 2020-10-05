import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

export function transformThrowStatement(state: TransformState, node: ts.ThrowStatement) {
	const args = new Array<luau.Expression>();
	if (node.expression !== undefined) {
		args.push(transformExpression(state, node.expression));
	}
	return luau.list.make(
		luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.call(luau.globals.error, args),
		}),
	);
}

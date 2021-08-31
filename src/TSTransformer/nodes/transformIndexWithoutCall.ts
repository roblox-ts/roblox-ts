import luau from "LuauAST";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { PropertyAccessExpression } from "typescript";

export function transformIndexWithoutCall(state: TransformState, node: PropertyAccessExpression) {
	const statements = luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: luau.create(luau.SyntaxKind.MethodCallExpression, {
				expression: convertToIndexableExpression(transformExpression(state, node.expression)),
				name: node.name.escapedText.toString(),
				args: luau.list.make<luau.Expression<keyof luau.ExpressionByKind>>(
					luau.create(luau.SyntaxKind.VarArgsLiteral, {}),
				),
			}),
		}),
	);
	return luau.create(luau.SyntaxKind.FunctionExpression, {
		statements,
		parameters: luau.list.make(),
		hasDotDotDot: true,
	});
}

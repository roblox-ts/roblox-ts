import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import ts from "typescript";

export function wrapStatementsAsGenerator(state: TransformState, node: ts.Node, statements: luau.List<luau.Statement>) {
	return luau.list.make(
		luau.create(luau.SyntaxKind.ReturnStatement, {
			expression: luau.call(state.TS(node, "generator"), [
				luau.create(luau.SyntaxKind.FunctionExpression, {
					hasDotDotDot: false,
					parameters: luau.list.make(),
					statements,
				}),
			]),
		}),
	);
}

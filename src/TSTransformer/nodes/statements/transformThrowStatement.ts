import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformThrowStatement(state: TransformState, node: ts.ThrowStatement) {
	const statements = luau.list.make<luau.Statement>();
	const prereqs = new Prereqs();
	const args = [transformExpression(state, prereqs, node.expression)];

	luau.list.pushList(statements, prereqs.statements);
	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.call(luau.globals.error, args),
		}),
	);
	return statements;
}

import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import ts from "typescript";

export function transformInitializer(state: TransformState, id: luau.WritableExpression, initializer: ts.Expression) {
	const statements = luau.list.make<luau.Statement>();
	const initializerPrereqs = new Prereqs();
	const value = transformExpression(state, initializerPrereqs, initializer);
	luau.list.pushList(statements, initializerPrereqs.statements);
	luau.list.push(
		statements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: id,
			operator: "=",
			right: value,
		}),
	);

	return luau.create(luau.SyntaxKind.IfStatement, {
		condition: luau.binary(id, "==", luau.nil()),
		elseBody: luau.list.make(),
		statements,
	});
}

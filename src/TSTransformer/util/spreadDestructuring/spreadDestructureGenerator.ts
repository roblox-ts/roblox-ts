import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";

export function spreadDestructureGenerator(state: TransformState, parentId: luau.AnyIdentifier) {
	const restId = state.pushToVar(luau.array(), "rest");

	const valueId = luau.tempId("v");
	const variable = luau.create(luau.SyntaxKind.VariableDeclaration, {
		left: valueId,
		right: luau.call(luau.property(parentId, "next")),
	});

	const doneCheck = luau.create(luau.SyntaxKind.IfStatement, {
		condition: luau.create(luau.SyntaxKind.BinaryExpression, {
			left: luau.property(valueId, "done"),
			operator: "==",
			right: luau.create(luau.SyntaxKind.TrueLiteral, {}),
		}),
		elseBody: luau.list.make(),
		statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
	});

	const pushToRest = luau.create(luau.SyntaxKind.CallStatement, {
		expression: luau.call(luau.globals.table.insert, [restId, luau.property(valueId, "value")]),
	});

	state.prereq(
		luau.create(luau.SyntaxKind.WhileStatement, {
			condition: luau.create(luau.SyntaxKind.TrueLiteral, {}),
			statements: luau.list.make<luau.Statement>(variable, doneCheck, pushToRest),
		}),
	);

	return restId;
}

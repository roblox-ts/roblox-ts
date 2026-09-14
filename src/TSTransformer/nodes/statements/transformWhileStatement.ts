import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";
import ts from "typescript";

export function transformWhileStatement(state: TransformState, node: ts.WhileStatement) {
	const whileStatements = luau.list.make<luau.Statement>();

	const conditionPrereqs = new Prereqs();
	let conditionExp = createTruthinessChecks(
		state,
		conditionPrereqs,
		transformExpression(state, conditionPrereqs, node.expression),
		node.expression,
	);

	if (!luau.list.isEmpty(conditionPrereqs.statements)) {
		luau.list.pushList(whileStatements, conditionPrereqs.statements);
		luau.list.push(
			whileStatements,
			luau.create(luau.SyntaxKind.IfStatement, {
				condition: luau.unary("not", conditionExp),
				statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
				elseBody: luau.list.make(),
			}),
		);
		conditionExp = luau.bool(true);
	}

	luau.list.pushList(whileStatements, transformStatementList(state, node.statement, getStatements(node.statement)));

	return luau.list.make(
		luau.create(luau.SyntaxKind.WhileStatement, {
			condition: conditionExp,
			statements: whileStatements,
		}),
	);
}

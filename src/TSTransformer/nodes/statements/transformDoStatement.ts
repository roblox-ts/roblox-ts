import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";
import ts from "typescript";

export function transformDoStatement(state: TransformState, { expression, statement }: ts.DoStatement) {
	const statements = transformStatementList(state, statement, getStatements(statement));

	let conditionIsInvertedInLuau = true;
	if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.ExclamationToken) {
		expression = expression.operand;
		conditionIsInvertedInLuau = false;
	}

	const prereqs = new Prereqs();
	const condition = createTruthinessChecks(
		state,
		prereqs,
		transformExpression(state, prereqs, expression),
		expression,
	);

	const repeatStatements = luau.list.make<luau.Statement>();
	luau.list.push(
		repeatStatements,
		luau.create(luau.SyntaxKind.DoStatement, {
			statements,
		}),
	);
	luau.list.pushList(repeatStatements, prereqs.statements);

	return luau.list.make(
		luau.create(luau.SyntaxKind.RepeatStatement, {
			statements: repeatStatements,
			condition: conditionIsInvertedInLuau ? luau.unary("not", condition) : condition,
		}),
	);
}

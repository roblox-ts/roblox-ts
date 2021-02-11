import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";

export function transformWhileStatementInner(
	state: TransformState,
	condition: ts.Expression | undefined,
	statement: ts.Statement,
	initializers: luau.List<luau.Statement> | undefined = undefined,
) {
	const statements = transformStatementList(state, getStatements(statement));

	const whileStatements = luau.list.make<luau.Statement>();

	// eslint-disable-next-line prefer-const
	let [conditionExp, conditionPrereqs] = state.capture(() => {
		if (condition) {
			return createTruthinessChecks(
				state,
				transformExpression(state, condition),
				condition,
				state.getType(condition),
			);
		} else {
			return luau.bool(true);
		}
	});

	if (!luau.list.isEmpty(conditionPrereqs)) {
		luau.list.pushList(whileStatements, conditionPrereqs);
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

	if (initializers) {
		luau.list.pushList(whileStatements, initializers);
	}

	luau.list.pushList(whileStatements, statements);

	return luau.create(luau.SyntaxKind.WhileStatement, {
		condition: conditionExp,
		statements: whileStatements,
	});
}

export function transformWhileStatement(state: TransformState, node: ts.WhileStatement) {
	return luau.list.make(transformWhileStatementInner(state, node.expression, node.statement));
}

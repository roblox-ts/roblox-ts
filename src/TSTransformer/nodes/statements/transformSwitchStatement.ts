import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createHoistDeclaration } from "TSTransformer/util/createHoistDeclaration";

function transformCaseClauseExpression(
	state: TransformState,
	caseClauseExpression: ts.Expression,
	switchExpression: lua.Expression,
	fallThroughFlagId: lua.TemporaryIdentifier,
	canFallThroughTo: boolean,
) {
	// eslint-disable-next-line prefer-const
	let [expression, prereqStatements] = state.capture(() => transformExpression(state, caseClauseExpression));

	let condition: lua.Expression = lua.binary(switchExpression, "==", expression);

	if (canFallThroughTo) {
		if (prereqStatements.head) {
			const noFallThroughCondition = lua.unary("not", fallThroughFlagId);

			lua.list.push(
				prereqStatements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: fallThroughFlagId,
					operator: "=",
					right: expression,
				}),
			);

			prereqStatements = lua.list.make<lua.Statement>(
				lua.create(lua.SyntaxKind.IfStatement, {
					condition: noFallThroughCondition,
					statements: prereqStatements,
					elseBody: lua.list.make<lua.Statement>(),
				}),
			);

			condition = fallThroughFlagId;
		} else {
			condition = lua.binary(fallThroughFlagId, "or", condition);
		}
	}

	return {
		condition,
		prereqStatements,
	};
}

function transformCaseClause(
	state: TransformState,
	node: ts.CaseClause,
	switchExpression: lua.Expression,
	fallThroughFlagId: lua.TemporaryIdentifier,
	canFallThroughTo: boolean,
	shouldUpdateFallThroughFlag: boolean,
) {
	const { condition, prereqStatements } = transformCaseClauseExpression(
		state,
		node.expression,
		switchExpression,
		fallThroughFlagId,
		canFallThroughTo,
	);

	const nonEmptyStatements = node.statements.filter(v => !ts.isEmptyStatement(v));
	const firstStatement = nonEmptyStatements[0];
	const statements = transformStatementList(
		state,
		nonEmptyStatements.length === 1 && ts.isBlock(firstStatement) ? firstStatement.statements : node.statements,
	);

	const canFallThroughFrom = statements.tail !== undefined && !lua.isFinalStatement(statements.tail.value);
	if (canFallThroughFrom && shouldUpdateFallThroughFlag) {
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.Assignment, {
				left: fallThroughFlagId,
				operator: "=",
				right: lua.bool(true),
			}),
		);
	}

	const clauseStatements = lua.list.make<lua.Statement>();

	const hoistDeclaration = createHoistDeclaration(state, node);
	if (hoistDeclaration) {
		lua.list.push(clauseStatements, hoistDeclaration);
	}

	lua.list.push(
		clauseStatements,
		lua.create(lua.SyntaxKind.IfStatement, {
			condition,
			statements,
			elseBody: lua.list.make(),
		}),
	);

	return {
		canFallThroughFrom,
		prereqs: prereqStatements,
		clauseStatements,
	};
}

export function transformSwitchStatement(state: TransformState, node: ts.SwitchStatement) {
	const expression = state.pushToVarIfComplex(transformExpression(state, node.expression));
	const fallThroughFlagId = lua.tempId();

	let isFallThroughFlagNeeded = false;

	const statements = lua.list.make<lua.Statement>();
	let canFallThroughTo = false;
	for (let i = 0; i < node.caseBlock.clauses.length; i++) {
		const caseClauseNode = node.caseBlock.clauses[i];

		if (ts.isCaseClause(caseClauseNode)) {
			const shouldUpdateFallThroughFlag =
				i < node.caseBlock.clauses.length - 1 && ts.isCaseClause(node.caseBlock.clauses[i + 1]);
			const { canFallThroughFrom, prereqs, clauseStatements } = transformCaseClause(
				state,
				caseClauseNode,
				expression,
				fallThroughFlagId,
				canFallThroughTo,
				shouldUpdateFallThroughFlag,
			);

			lua.list.pushList(statements, prereqs);
			lua.list.pushList(statements, clauseStatements);

			canFallThroughTo = canFallThroughFrom;

			if (canFallThroughFrom) {
				isFallThroughFlagNeeded = true;
			}
		} else {
			lua.list.pushList(statements, transformStatementList(state, caseClauseNode.statements));
			break;
		}
	}

	if (isFallThroughFlagNeeded) {
		lua.list.unshift(
			statements,
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: fallThroughFlagId,
				right: lua.bool(false),
			}),
		);
	}

	return lua.list.make<lua.Statement>(
		lua.create(lua.SyntaxKind.RepeatStatement, {
			condition: lua.bool(true),
			statements,
		}),
	);
}

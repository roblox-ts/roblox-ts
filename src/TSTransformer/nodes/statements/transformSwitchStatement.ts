import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";

function doesStatementListEndWithFinalStatement(statements: lua.List<lua.Statement>) {
	return statements.tail && lua.isFinalStatement(statements.tail.value);
}

function transformCaseClauseExpression(
	state: TransformState,
	caseClauseExpression: ts.Expression,
	switchExpression: lua.Expression,
	fallThroughFlagId: lua.TemporaryIdentifier,
	canFallThroughTo: boolean,
) {
	const capturePrereqsResult = state.capturePrereqs(() => transformExpression(state, caseClauseExpression));
	let { statements: prereqStatements } = capturePrereqsResult;
	const { expression } = capturePrereqsResult;

	let condition: lua.Expression = lua.create(lua.SyntaxKind.BinaryExpression, {
		left: switchExpression,
		right: expression,
		operator: "==",
	});

	if (canFallThroughTo) {
		if (prereqStatements.head) {
			const noFallThroughCondition = lua.create(lua.SyntaxKind.UnaryExpression, {
				expression: fallThroughFlagId,
				operator: "not",
			});

			lua.list.push(
				prereqStatements,
				lua.create(lua.SyntaxKind.Assignment, {
					left: fallThroughFlagId,
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
			condition = lua.create(lua.SyntaxKind.BinaryExpression, {
				left: fallThroughFlagId,
				right: condition,
				operator: "or",
			});
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
	const statements = transformStatementList(state, node.statements);

	const canFallThroughFrom = !doesStatementListEndWithFinalStatement(statements);
	if (canFallThroughFrom && shouldUpdateFallThroughFlag) {
		lua.list.push(
			statements,
			lua.create(lua.SyntaxKind.Assignment, {
				left: fallThroughFlagId,
				right: lua.bool(true),
			}),
		);
	}

	const clauseStatement = lua.create(lua.SyntaxKind.IfStatement, {
		condition,
		statements,
		elseBody: lua.list.make(),
	});

	return {
		canFallThroughFrom,
		prereqs: prereqStatements,
		statement: clauseStatement,
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
			const { canFallThroughFrom, prereqs, statement } = transformCaseClause(
				state,
				caseClauseNode,
				expression,
				fallThroughFlagId,
				canFallThroughTo,
				shouldUpdateFallThroughFlag,
			);

			lua.list.pushList(statements, prereqs);
			lua.list.push(statements, statement);

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

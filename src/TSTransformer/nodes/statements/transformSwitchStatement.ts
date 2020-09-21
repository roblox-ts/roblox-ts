import ts from "byots";
import luau from "LuauAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createHoistDeclaration } from "TSTransformer/util/createHoistDeclaration";

function transformCaseClauseExpression(
	state: TransformState,
	caseClauseExpression: ts.Expression,
	switchExpression: luau.Expression,
	fallThroughFlagId: luau.TemporaryIdentifier,
	canFallThroughTo: boolean,
) {
	// eslint-disable-next-line prefer-const
	let [expression, prereqStatements] = state.capture(() => transformExpression(state, caseClauseExpression));

	let condition: luau.Expression = luau.binary(switchExpression, "==", expression);

	if (canFallThroughTo) {
		if (!luau.list.isEmpty(prereqStatements)) {
			const noFallThroughCondition = luau.unary("not", fallThroughFlagId);

			luau.list.push(
				prereqStatements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: fallThroughFlagId,
					operator: "=",
					right: condition,
				}),
			);

			prereqStatements = luau.list.make<luau.Statement>(
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: noFallThroughCondition,
					statements: prereqStatements,
					elseBody: luau.list.make<luau.Statement>(),
				}),
			);

			condition = fallThroughFlagId;
		} else {
			condition = luau.binary(fallThroughFlagId, "or", condition);
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
	switchExpression: luau.Expression,
	fallThroughFlagId: luau.TemporaryIdentifier,
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

	const canFallThroughFrom = statements.tail === undefined || !luau.isFinalStatement(statements.tail.value);
	if (canFallThroughFrom && shouldUpdateFallThroughFlag) {
		luau.list.push(
			statements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: fallThroughFlagId,
				operator: "=",
				right: luau.bool(true),
			}),
		);
	}

	const clauseStatements = luau.list.make<luau.Statement>();

	const hoistDeclaration = createHoistDeclaration(state, node);
	if (hoistDeclaration) {
		luau.list.push(clauseStatements, hoistDeclaration);
	}

	luau.list.push(
		clauseStatements,
		luau.create(luau.SyntaxKind.IfStatement, {
			condition,
			statements,
			elseBody: luau.list.make(),
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
	const fallThroughFlagId = luau.tempId();

	let isFallThroughFlagNeeded = false;

	const statements = luau.list.make<luau.Statement>();
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

			luau.list.pushList(statements, prereqs);
			luau.list.pushList(statements, clauseStatements);

			canFallThroughTo = canFallThroughFrom;

			if (canFallThroughFrom) {
				isFallThroughFlagNeeded = true;
			}
		} else {
			luau.list.pushList(statements, transformStatementList(state, caseClauseNode.statements));
			break;
		}
	}

	if (isFallThroughFlagNeeded) {
		luau.list.unshift(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: fallThroughFlagId,
				right: luau.bool(false),
			}),
		);
	}

	return luau.list.make<luau.Statement>(
		luau.create(luau.SyntaxKind.RepeatStatement, {
			condition: luau.bool(true),
			statements,
		}),
	);
}

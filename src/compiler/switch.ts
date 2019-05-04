import * as ts from "ts-morph";
import { compileExpression, compileStatementedNode } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";

export function compileSwitchStatement(state: CompilerState, node: ts.SwitchStatement) {
	let preResult = "";
	let expStr: string;

	const expression = node.getExpression();
	state.enterPrecedingStatementContext();
	const rawExpStr = compileExpression(state, expression);
	const hasStatements = state.currentPrecedingStatementContextHasStatements(expression);
	const expressionContext = state.exitPrecedingStatementContext();

	if (hasStatements) {
		preResult += expressionContext.join("");
	}

	if (hasStatements && expressionContext.isPushed) {
		expStr = rawExpStr;
	} else {
		expStr = state.getNewId();
		preResult += state.indent + `local ${expStr} = ${rawExpStr};\n`;
	}

	preResult += state.indent + `repeat\n`;
	state.pushIndent();
	state.pushIdStack();
	let fallThroughVar: string;

	const clauses = node.getCaseBlock().getClauses();
	let anyFallThrough = false;

	let result = "";

	let previousCaseFallsThrough = false;
	const lastClauseIndex = clauses.length - 1;
	const hasDefault = !ts.TypeGuards.isCaseClause(clauses[lastClauseIndex]);

	for (let i = 0; i < clauses.length; i++) {
		const clause = clauses[i];

		// add if statement if the clause is non-default
		let isNonDefault = false;
		if (ts.TypeGuards.isCaseClause(clause)) {
			isNonDefault = true;
			state.enterPrecedingStatementContext();
			const clauseExpStr = compileExpression(state, clause.getExpression());
			const fallThroughVarOr = previousCaseFallsThrough ? `${fallThroughVar!} or ` : "";
			result += state.exitPrecedingStatementContextAndJoin();
			result += state.indent + `if ${fallThroughVarOr}${expStr} == ( ${clauseExpStr} ) then\n`;
			state.pushIndent();
		} else if (i !== lastClauseIndex) {
			throw new CompilerError(
				"Default case must be the last case in a switch statement!",
				clause,
				CompilerErrorType.BadSwitchDefaultPosition,
			);
		}

		const statements = clause.getStatements();

		let lastStatement = statements[statements.length - 1];
		while (lastStatement && ts.TypeGuards.isBlock(lastStatement)) {
			const blockStatements = lastStatement.getStatements();
			lastStatement = blockStatements[blockStatements.length - 1];
		}
		const endsInReturnOrBreakStatement =
			lastStatement &&
			(ts.TypeGuards.isReturnStatement(lastStatement) || ts.TypeGuards.isBreakStatement(lastStatement));

		const currentCaseFallsThrough =
			!endsInReturnOrBreakStatement && (hasDefault ? lastClauseIndex - 1 : lastClauseIndex) > i;

		result += compileStatementedNode(state, clause);

		if (currentCaseFallsThrough) {
			if (!anyFallThrough) {
				fallThroughVar = state.getNewId();
				anyFallThrough = true;
			}
			result += state.indent + `${fallThroughVar!} = true;\n`;
		}

		if (isNonDefault) {
			state.popIndent();
			result += state.indent + `end;\n`;
		}

		previousCaseFallsThrough = currentCaseFallsThrough;
	}

	if (anyFallThrough) {
		result = state.indent + `local ${fallThroughVar!} = false;\n` + result;
	}
	state.popIdStack();
	state.popIndent();
	result += state.indent + `until true;\n`;
	return preResult + result;
}

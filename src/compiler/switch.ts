import * as ts from "ts-morph";
import { compileExpression, compileStatementedNode } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { joinIndentedLines } from "../utility";
import { shouldWrapExpression } from "./call";

type FallThroughArray = Array<string>;

export function compileSwitchStatement(state: CompilerState, node: ts.SwitchStatement) {
	let preResult = "";
	let expStr: string;

	const expression = node.getExpression();
	state.enterPrecedingStatementContext();
	const rawExpStr = compileExpression(state, expression);
	const expressionContext = state.exitPrecedingStatementContext();
	const hasStatements = expressionContext.length > 0;

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
	state.hoistStack.push(new Set<string>());
	let fallThroughVar: string;

	const clauses = node.getCaseBlock().getClauses();
	let anyFallThrough = false;

	let result = "";
	let previousCaseFallsThrough = false;
	const lastClauseIndex = clauses.length - 1;
	const lastClause = clauses[lastClauseIndex];
	const lastStatementedClauseIndex =
		clauses.length -
		1 -
		[...clauses]
			.reverse()
			.findIndex(clause => ts.TypeGuards.isCaseClause(clause) && clause.getStatements().length > 0);

	if (lastClause) {
		const hasDefault = !ts.TypeGuards.isCaseClause(lastClause);
		let fallThroughConditions = new Array() as FallThroughArray;

		for (let i = 0; i < clauses.length; i++) {
			const clause = clauses[i];
			const statements = clause.getStatements();
			const fallThroughValue = "true";

			let lastStatement = statements[statements.length - 1];

			while (lastStatement && ts.TypeGuards.isBlock(lastStatement)) {
				const blockStatements = lastStatement.getStatements();
				lastStatement = blockStatements[blockStatements.length - 1];
			}

			const endsInReturnOrBreakStatement =
				lastStatement &&
				(ts.TypeGuards.isReturnStatement(lastStatement) || ts.TypeGuards.isBreakStatement(lastStatement));

			if (lastStatement && ts.TypeGuards.isBreakStatement(lastStatement) && clause === lastClause) {
				lastStatement.remove();
			}

			const currentCaseFallsThrough =
				!endsInReturnOrBreakStatement && (hasDefault ? lastClauseIndex - 1 : lastClauseIndex) > i;

			const shouldPushFallThroughVar =
				currentCaseFallsThrough && statements.length > 0 && i !== lastStatementedClauseIndex;

			// add if statement if the clause is non-default
			let isNonDefault = false;
			if (ts.TypeGuards.isCaseClause(clause)) {
				isNonDefault = true;
				state.enterPrecedingStatementContext();
				const clauseExp = clause.getExpression();
				let clauseExpStr = compileExpression(state, clauseExp);
				if (shouldWrapExpression(clauseExp, false)) {
					clauseExpStr = `(${clauseExpStr})`;
				}
				const context = state.exitPrecedingStatementContext();
				let condition = `${expStr} == ${clauseExpStr}`;

				if (
					!anyFallThrough &&
					(context.length > 0 ||
						(statements.length > 0 && currentCaseFallsThrough && i !== lastStatementedClauseIndex))
				) {
					fallThroughVar = state.getNewId();
					anyFallThrough = true;
					if (context.length === 0 || fallThroughConditions.length > 0) {
						result += state.indent + `local ${fallThroughVar!} = false;\n`;
					}
				}

				const needsIfStatement =
					fallThroughConditions.length > 0 &&
					(fallThroughConditions.length !== 1 || fallThroughConditions[0] !== fallThroughVar!);

				if (context.length > 0) {
					const indent = 1;
					if (needsIfStatement) {
						if (previousCaseFallsThrough && fallThroughVar! !== condition) {
							fallThroughConditions.unshift(fallThroughVar!);
						}
						result += state.indent + `if ${fallThroughConditions.join(" or ")} then\n`;
						result += state.indent + `\t${fallThroughVar!} = ${fallThroughValue};\n`;
						result += state.indent + "else\n";
						state.pushIndent();
					} else {
						result += state.indent + `if not ${fallThroughVar!} then\n`;
						state.pushIndent();
					}

					result += joinIndentedLines(context, indent);
					result += state.indent + `${fallThroughVar!} = ${condition};\n`;

					if (indent === 1) {
						state.popIndent();
						result += state.indent + `end;\n`;
					}
					condition = fallThroughVar!;
					fallThroughConditions = [];
				}

				fallThroughConditions.push(condition);

				if (statements.length === 0) {
					// previousCaseFallsThrough = false;
					continue;
				} else if (needsIfStatement) {
					if (previousCaseFallsThrough && fallThroughVar! !== condition) {
						fallThroughConditions.unshift(fallThroughVar!);
					}

					console.log(fallThroughConditions);
					result += state.indent + `if ${fallThroughConditions.join(" or ")} then\n`;
					state.pushIndent();
					fallThroughConditions = new Array<string>();
				}
			} else if (i !== lastClauseIndex) {
				throw new CompilerError(
					"Default case must be the last case in a switch statement!",
					clause,
					CompilerErrorType.BadSwitchDefaultPosition,
				);
			} else {
				// empty remaining conditions

				if (
					fallThroughConditions.length > 0 &&
					(fallThroughConditions.length !== 1 || fallThroughConditions[0] !== fallThroughVar!)
				) {
					if (anyFallThrough) {
						result += state.indent + `${fallThroughVar!} = ${fallThroughConditions.join(" or ")};\n`;
					} else {
						result += state.indent + `if ${fallThroughConditions.join(" or ")} then\n${state.indent}end;\n`;
					}
					fallThroughConditions = [];
				}
			}

			result += compileStatementedNode(state, clause);

			if (shouldPushFallThroughVar) {
				result += state.indent + `${fallThroughVar!} = ${fallThroughValue};\n`;
			}

			if (fallThroughValue === "true" && isNonDefault) {
				state.popIndent();
				result += state.indent + `end;\n`;
			}

			previousCaseFallsThrough = currentCaseFallsThrough;
		}

		// empty remaining conditions
		if (
			fallThroughConditions.length > 0 &&
			(fallThroughConditions.length !== 1 || fallThroughConditions[0] !== fallThroughVar!)
		) {
			if (anyFallThrough) {
				result += state.indent + `${fallThroughVar!} = ${fallThroughConditions.join(" or ")};\n`;
			} else {
				result += state.indent + `if ${fallThroughConditions.join(" or ")} then\n${state.indent}end;\n`;
			}
			fallThroughConditions = [];
		}
	}

	result = state.popHoistStack(result);
	state.popIdStack();
	state.popIndent();
	result += state.indent + `until true;\n`;
	return preResult + result;
}

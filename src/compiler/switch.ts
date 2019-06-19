import * as ts from "ts-morph";
import { compileExpression, compileStatementedNode, isIdentifierDefinedInConst, shouldWrapExpression } from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { joinIndentedLines, skipNodesDownwards } from "../utility";

function fallThroughConditionsRequireIfStatement(fallThroughConditions: Array<string>, fallThroughVar?: string) {
	return (
		fallThroughConditions.length > 0 &&
		(fallThroughConditions.length !== 1 || fallThroughConditions[0] !== fallThroughVar)
	);
}

function compileRemainingConditions(
	state: CompilerState,
	result: string,
	fallThroughConditions: Array<string>,
	anyFallThrough: boolean,
	previousCaseFallsThrough: boolean,
	fallThroughVar?: string,
) {
	if (fallThroughVar && previousCaseFallsThrough && fallThroughConditions[0] !== fallThroughVar) {
		fallThroughConditions.unshift(fallThroughVar);
	}
	if (anyFallThrough) {
		return result + state.indent + `${fallThroughVar} = ${fallThroughConditions.join(" or ")};\n`;
	} else {
		return result + state.indent + `if ${fallThroughConditions.join(" or ")} then\n${state.indent}end;\n`;
	}
}

export function compileSwitchStatement(state: CompilerState, node: ts.SwitchStatement) {
	let preResult = "";
	let expStr: string;

	const expression = skipNodesDownwards(node.getExpression());
	state.enterPrecedingStatementContext();
	const rawExpStr = compileExpression(state, expression);
	const expressionContext = state.exitPrecedingStatementContext();
	const hasPrecedingStatements = expressionContext.length > 0;

	if (hasPrecedingStatements) {
		preResult += expressionContext.join("");
	}

	if (
		(hasPrecedingStatements && expressionContext.isPushed) ||
		(ts.TypeGuards.isIdentifier(expression) && isIdentifierDefinedInConst(expression))
	) {
		expStr = rawExpStr;
	} else {
		expStr = state.getNewId();
		preResult += state.indent + `local ${expStr} = ${rawExpStr};\n`;
	}

	preResult += state.indent + `repeat\n`;
	state.pushIndent();
	state.pushIdStack();
	state.hoistStack.push(new Set<string>());
	let fallThroughVar: string | undefined;

	const clauses = node.getCaseBlock().getClauses();
	let anyFallThrough = false;

	let result = "";
	let previousCaseFallsThrough = false;
	const lastClauseIndex = clauses.length - 1;
	const lastClause = clauses[lastClauseIndex];
	const lastNonDefaultClauseIndex =
		clauses.length - 1 - [...clauses].reverse().findIndex(clause => ts.TypeGuards.isCaseClause(clause));

	if (lastClause) {
		const hasDefault = !ts.TypeGuards.isCaseClause(lastClause);
		let fallThroughConditions = new Array<string>();

		for (let i = 0; i < clauses.length; i++) {
			const clause = clauses[i];
			const statements = clause.getStatements();
			let writeThatWeFellThrough = true;

			let lastStatement = statements[statements.length - 1];
			let blockStatements = statements;
			while (lastStatement && ts.TypeGuards.isBlock(lastStatement)) {
				blockStatements = lastStatement.getStatements();
				lastStatement = blockStatements[blockStatements.length - 1];
			}

			// Returns/Breaks are not always the last statement. Unreachable code is valid TS
			const endsInReturnOrBreakStatement = blockStatements.find(
				statement => ts.TypeGuards.isBreakStatement(statement) || ts.TypeGuards.isReturnStatement(statement),
			);

			const hasStatements = statements.length > 0;

			const currentCaseFallsThrough =
				!endsInReturnOrBreakStatement && (hasDefault ? lastClauseIndex - 1 : lastClauseIndex) > i;

			const shouldPushFallThroughVar =
				currentCaseFallsThrough && hasStatements && i !== lastNonDefaultClauseIndex;

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
				let context: PrecedingStatementContext | undefined = state.exitPrecedingStatementContext();
				const hasContext = context.length > 0;
				let condition = `${expStr} == ${clauseExpStr}`;

				const fellThroughFirstHere = !anyFallThrough;
				let wroteFallThrough = false;

				/*
					God, grant me the serenity to accept the things I cannot change,
					The courage to change the things I can,
					And wisdom to know the difference.
				*/
				if (
					!anyFallThrough &&
					(((!hasStatements || previousCaseFallsThrough) && hasContext) ||
						(hasStatements && currentCaseFallsThrough && i !== lastNonDefaultClauseIndex))
				) {
					fallThroughVar = state.getNewId();
					anyFallThrough = true;
					if (
						hasStatements ||
						(hasContext &&
							(fallThroughConditionsRequireIfStatement(fallThroughConditions, fallThroughVar) ||
								previousCaseFallsThrough))
					) {
						result += state.indent + `local ${fallThroughVar} = false;\n`;
						wroteFallThrough = true;
					}
				}

				if (!hasStatements || previousCaseFallsThrough) {
					if (fallThroughVar && hasContext) {
						let indent = 1;
						if (fallThroughConditionsRequireIfStatement(fallThroughConditions, fallThroughVar)) {
							if (
								fallThroughVar &&
								!wroteFallThrough &&
								previousCaseFallsThrough &&
								fallThroughVar !== condition &&
								fallThroughConditions[0] !== fallThroughVar
							) {
								fallThroughConditions.unshift(fallThroughVar);
							}
							result += state.indent + `if ${fallThroughConditions.join(" or ")} then\n`;
							result += state.indent + `\t${fallThroughVar} = true;\n`;
							result += state.indent + "else\n";
							state.pushIndent();
						} else if (previousCaseFallsThrough) {
							result += state.indent + `if not ${fallThroughVar} then\n`;
							state.pushIndent();
						} else {
							indent = 0;
						}

						result += joinIndentedLines(context, indent);
						result +=
							state.indent +
							`${
								fellThroughFirstHere && !wroteFallThrough ? "local " : ""
							}${fallThroughVar} = ${condition};\n`;

						if (indent === 1) {
							state.popIndent();
							result += state.indent + `end;\n`;
						}

						condition = fallThroughVar;
						fallThroughConditions = [];
						context = undefined;
					}
				}

				fallThroughConditions.push(condition);

				if (hasStatements) {
					if (
						fallThroughVar &&
						!wroteFallThrough &&
						previousCaseFallsThrough &&
						fallThroughVar !== condition &&
						fallThroughConditions[0] !== fallThroughVar
					) {
						fallThroughConditions.unshift(fallThroughVar);
					}

					if (context) {
						result += joinIndentedLines(context, 0);
					}

					if (fallThroughConditions.length === 1 && fallThroughConditions[0] === fallThroughVar) {
						writeThatWeFellThrough = false;
					}
					result += state.indent + `if ${fallThroughConditions.join(" or ")} then\n`;
					state.pushIndent();
					fallThroughConditions = new Array<string>();
				} else {
					previousCaseFallsThrough = true;
					continue;
				}
			} else if (i !== lastClauseIndex) {
				throw new CompilerError(
					"Default case must be the last case in a switch statement!",
					clause,
					CompilerErrorType.BadSwitchDefaultPosition,
				);
			} else {
				// empty remaining conditions

				if (fallThroughConditionsRequireIfStatement(fallThroughConditions, fallThroughVar)) {
					result = compileRemainingConditions(
						state,
						result,
						fallThroughConditions,
						anyFallThrough,
						previousCaseFallsThrough,
						fallThroughVar,
					);
					fallThroughConditions = [];
				}
			}

			result += compileStatementedNode(state, clause);

			if (writeThatWeFellThrough && shouldPushFallThroughVar) {
				result += state.indent + `${fallThroughVar} = true;\n`;
			}

			if (isNonDefault) {
				state.popIndent();
				result += state.indent + `end;\n`;
			}

			previousCaseFallsThrough = currentCaseFallsThrough;
		}

		// empty remaining conditions
		if (fallThroughConditionsRequireIfStatement(fallThroughConditions, fallThroughVar)) {
			result = compileRemainingConditions(
				state,
				result,
				fallThroughConditions,
				anyFallThrough,
				previousCaseFallsThrough,
				fallThroughVar,
			);
		}
	}

	result = state.popHoistStack(result);
	state.popIdStack();
	state.popIndent();
	result += state.indent + `until true;\n`;
	return preResult + result;
}

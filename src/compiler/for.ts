import * as ts from "ts-morph";
import {
	compileExpression,
	compileLoopBody,
	compileNumericLiteral,
	compileVariableDeclarationList,
	expressionModifiesVariable,
	getFirstMemberWithParameters,
	placeIncrementorInStatementIfExpression,
} from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
import { isNumberType } from "../typeUtilities";
import { isIdentifierWhoseDefinitionMatchesNode, joinIndentedLines } from "../utility";

function isConstantNumberVariableOrLiteral(condValue: ts.Node) {
	return (
		ts.TypeGuards.isNumericLiteral(condValue) ||
		(isNumberType(condValue.getType()) &&
			ts.TypeGuards.isIdentifier(condValue) &&
			condValue.getDefinitions().every(a => {
				const declNode = a.getDeclarationNode();
				if (declNode && ts.TypeGuards.isVariableDeclaration(declNode)) {
					const declParent = declNode.getParent();
					if (ts.TypeGuards.isVariableDeclarationList(declParent)) {
						return declParent.getDeclarationKind() === ts.VariableDeclarationKind.Const;
					}
				}
				return false;
			}))
	);
}

function isExpressionConstantNumbers(node: ts.Node): boolean {
	const children = node.getChildren();
	return (
		children.length > 0 &&
		children.every(
			child =>
				isConstantNumberVariableOrLiteral(child) ||
				child.getKind() === ts.SyntaxKind.PlusToken ||
				child.getKind() === ts.SyntaxKind.MinusToken ||
				child.getKind() === ts.SyntaxKind.AsteriskToken ||
				child.getKind() === ts.SyntaxKind.SlashToken ||
				child.getKind() === ts.SyntaxKind.AsteriskAsteriskToken ||
				child.getKind() === ts.SyntaxKind.PercentToken ||
				(ts.TypeGuards.isPrefixUnaryExpression(child) &&
					child.getOperatorToken() === ts.SyntaxKind.MinusToken) ||
				(ts.TypeGuards.isBinaryExpression(child) && isExpressionConstantNumbers(child)),
		)
	);
}

function getSignAndIncrementorForStatement(
	state: CompilerState,
	incrementor: ts.BinaryExpression | ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
	lhs: ts.Identifier,
) {
	let forIntervalStr = "";
	let sign: "" | "+" | "-" = "";

	if (ts.TypeGuards.isBinaryExpression(incrementor)) {
		const sibling = incrementor.getChildAtIndex(0).getNextSibling();
		if (sibling) {
			let rhsIncr = sibling.getNextSibling();

			if (rhsIncr) {
				if (
					isNumberType(rhsIncr.getType()) &&
					sibling.getKind() === ts.SyntaxKind.EqualsToken &&
					ts.TypeGuards.isBinaryExpression(rhsIncr)
				) {
					const sib0 = rhsIncr.getChildAtIndex(0);
					const sib1 = rhsIncr.getChildAtIndex(1);

					if (
						sib0 &&
						ts.TypeGuards.isIdentifier(sib0) &&
						isIdentifierWhoseDefinitionMatchesNode(sib0, lhs) &&
						sib1
					) {
						if (sib1.getKind() === ts.SyntaxKind.MinusToken) {
							sign = "-";
						} else if (sib1.getKind() === ts.SyntaxKind.PlusToken) {
							sign = "+";
						}
						rhsIncr = sib1.getNextSibling();
						if (rhsIncr && rhsIncr.getNextSibling()) {
							rhsIncr = undefined;
						}
					}
				} else {
					switch (sibling.getKind()) {
						case ts.SyntaxKind.PlusEqualsToken:
							sign = "+";
							break;
						case ts.SyntaxKind.MinusEqualsToken:
							sign = "-";
							break;
						default:
							break;
					}
				}

				if (rhsIncr && ts.TypeGuards.isPrefixUnaryExpression(rhsIncr)) {
					if (rhsIncr.getOperatorToken() === ts.SyntaxKind.MinusToken) {
						switch (sign) {
							case "+":
								sign = "-";
								break;
							case "-":
								sign = "+";
								break;
							case "":
								return ["", ""];
						}
						rhsIncr = rhsIncr.getChildAtIndex(1);
					}
				}

				if (rhsIncr && ts.TypeGuards.isNumericLiteral(rhsIncr)) {
					forIntervalStr = compileNumericLiteral(state, rhsIncr);
				}
			}
		}
	} else if (incrementor.getOperatorToken() === ts.SyntaxKind.MinusMinusToken) {
		forIntervalStr = "1";
		sign = "-";
	} else {
		forIntervalStr = "1";
		sign = "+";
	}
	return [sign, forIntervalStr];
}

function getLimitInForStatement(
	state: CompilerState,
	condition: ts.Expression<ts.ts.Expression>,
	lhs: ts.Identifier,
): [string, ts.Node<ts.ts.Node> | undefined] {
	if (ts.TypeGuards.isBinaryExpression(condition)) {
		const lhsCond = condition.getChildAtIndex(0);
		const sibling = lhsCond.getNextSibling();
		if (sibling) {
			const rhsCond = sibling.getNextSibling();

			if (rhsCond) {
				let other: ts.Node<ts.ts.Node>;

				if (isIdentifierWhoseDefinitionMatchesNode(lhsCond, lhs)) {
					other = rhsCond;
					switch (sibling.getKind()) {
						case ts.SyntaxKind.GreaterThanEqualsToken: // >=
							return [">=", other];
						case ts.SyntaxKind.LessThanEqualsToken: // <=
							return ["<=", other];
					}
				} else {
					other = lhsCond;
					switch (sibling.getKind()) {
						case ts.SyntaxKind.GreaterThanEqualsToken: // >=
							return ["<=", other];
						case ts.SyntaxKind.LessThanEqualsToken: // <=
							return [">=", other];
					}
				}
			}
		}
	}
	return ["", undefined];
}

function safelyHandleExpressionsInForStatement(
	state: CompilerState,
	incrementor: ts.Expression<ts.ts.Expression>,
	incrementorStr: string,
	context: PrecedingStatementContext,
	indentation: number,
) {
	return (
		joinIndentedLines(context, indentation) +
		state.indent +
		(context.isPushed
			? incrementorStr
			: placeIncrementorInStatementIfExpression(state, incrementor, incrementorStr))
	);
}

function getSimpleForLoopString(
	state: CompilerState,
	initializer: ts.VariableDeclarationList,
	forLoopVars: string,
	statement: ts.Statement<ts.ts.Statement>,
) {
	let result = "";
	state.popIndent();
	const first = compileVariableDeclarationList(state, initializer)
		.trim()
		.replace(/^local /, "")
		.replace(/;$/, "");

	result = state.indent + `for ${first}, ${forLoopVars} do\n`;
	state.pushIndent();
	result += compileLoopBody(state, statement);
	state.popIndent();
	result += state.indent + `end;\n`;
	return result;
}

export function compileForStatement(state: CompilerState, node: ts.ForStatement) {
	state.pushIdStack();
	const statement = node.getStatement();
	const condition = node.getCondition();
	const incrementor = node.getIncrementor();

	const localizations = new Array<string>();
	const cleanups = new Array<() => void>();
	let result = state.indent + "do\n";
	state.pushIndent();
	const initializer = node.getInitializer();
	let conditionStr: string | undefined;
	let incrementorStr: string | undefined;

	let conditionContext: PrecedingStatementContext | undefined;
	let incrementorContext: PrecedingStatementContext | undefined;
	let initializerContext: PrecedingStatementContext | undefined;

	if (initializer) {
		if (ts.TypeGuards.isVariableDeclarationList(initializer)) {
			const declarations = initializer.getDeclarations();
			const statementDescendants = statement.getDescendants();
			if (initializer.getDeclarationKind() === ts.VariableDeclarationKind.Let) {
				if (declarations.length === 1) {
					const lhs = declarations[0].getChildAtIndex(0);
					if (ts.TypeGuards.isIdentifier(lhs)) {
						const nextSibling = lhs.getNextSibling();

						if (
							!statementDescendants.some(statementDescendant =>
								expressionModifiesVariable(statementDescendant, lhs),
							) &&
							incrementor &&
							nextSibling &&
							condition
						) {
							// check if we can convert to a simple for loop
							// IF there aren't any in-loop modifications to the let variable
							// AND the let variable is a single numeric variable
							// AND the incrementor is a simple +/- expression of the let var
							// AND the conditional expression is a binary expression
							// with one of these operators: <= >= < >
							// AND the conditional expression compares the let var to a numeric literal
							// OR the conditional expression compares the let var to an unchanging number

							const rhs = nextSibling.getNextSibling();
							if (rhs) {
								const rhsType = rhs.getType();
								if (isNumberType(rhsType)) {
									if (expressionModifiesVariable(incrementor, lhs)) {
										const [incrSign, incrValue] = getSignAndIncrementorForStatement(
											state,
											incrementor,
											lhs,
										);
										if (incrSign && incrValue) {
											const [condSign, condValue] = getLimitInForStatement(state, condition, lhs);
											// numeric literals, or constant number identifiers are safe
											if (
												condValue &&
												ts.TypeGuards.isExpression(condValue) &&
												(isConstantNumberVariableOrLiteral(condValue) ||
													isExpressionConstantNumbers(condValue))
											) {
												if (
													(incrSign === "+" && condSign === "<=") ||
													(incrSign === "-" && condSign === ">=")
												) {
													const incrStr = incrSign === "-" ? incrSign + incrValue : incrValue;

													return getSimpleForLoopString(
														state,
														initializer,
														compileExpression(state, condValue) +
															(incrStr === "1" ? "" : ", " + incrStr),
														statement,
													);
												}
											}
										}
									}
								}
							}
						}
					}
				}
			}

			state.enterPrecedingStatementContext();
			const expStr = compileVariableDeclarationList(state, initializer);
			result += state.exitPrecedingStatementContextAndJoin() + expStr; // + ";\n";

			// if we can't convert to a simple for loop:
			// if it has any internal function declarations, make sure to locally scope variables
			if (getFirstMemberWithParameters(statementDescendants)) {
				state.enterPrecedingStatementContext();
				conditionStr = condition ? compileExpression(state, condition) : "true";
				conditionContext = state.exitPrecedingStatementContext();
				state.enterPrecedingStatementContext();
				incrementorStr = incrementor ? compileExpression(state, incrementor) + ";\n" : undefined;
				incrementorContext = state.exitPrecedingStatementContext();

				declarations.forEach(declaration => {
					const lhs = declaration.getChildAtIndex(0);

					if (ts.TypeGuards.isIdentifier(lhs)) {
						const name = lhs.getText();
						const isLoopVarModified = statementDescendants.some(statementDescendant =>
							expressionModifiesVariable(statementDescendant, lhs),
						);
						const alias = state.getNewId();
						state.pushIndent();
						localizations.push(`local ${alias} = ${name};\n`);
						state.popIndent();

						// don't leak
						const previous = state.variableAliases.get(name);

						cleanups.push(() => {
							if (previous) {
								state.variableAliases.set(name, previous);
							} else {
								state.variableAliases.delete(name);
							}

							if (isLoopVarModified) {
								result += state.indent + `${name} = ${alias};\n`;
							}
						});

						state.variableAliases.set(name, alias);
					}
				});
			}
		} else if (ts.TypeGuards.isExpression(initializer)) {
			state.enterPrecedingStatementContext();
			const expStr = compileExpression(state, initializer);
			initializerContext = state.exitPrecedingStatementContext();
			result += safelyHandleExpressionsInForStatement(state, initializer, expStr, initializerContext, 0) + ";\n";
		}
	}
	// order matters
	if (conditionStr === undefined) {
		state.enterPrecedingStatementContext();
		conditionStr = condition ? compileExpression(state, condition) : "true";
		conditionContext = state.exitPrecedingStatementContext();
		state.enterPrecedingStatementContext();
		incrementorStr = incrementor ? compileExpression(state, incrementor) + ";\n" : undefined;
		incrementorContext = state.exitPrecedingStatementContext();
	}

	const conditionContextHasStatements = conditionContext && conditionContext.length > 0;
	result += state.indent + `while ${conditionContextHasStatements ? "true" : conditionStr} do\n`;
	state.pushIndent();

	if (conditionContextHasStatements) {
		result += joinIndentedLines(conditionContext!, 1);
		result += state.indent + `if not (${conditionStr}) then break; end;\n`;
	}

	for (const localization of localizations) {
		result += state.indent + localization;
	}

	result += compileLoopBody(state, statement);
	cleanups.forEach(cleanup => cleanup());

	if (incrementor && incrementorStr) {
		result += safelyHandleExpressionsInForStatement(state, incrementor, incrementorStr, incrementorContext!, 1);
	}

	state.popIndent();
	result += state.indent + "end;\n";
	state.popIndent();
	result += state.indent + `end;\n`;
	state.popIdStack();
	return result;
}

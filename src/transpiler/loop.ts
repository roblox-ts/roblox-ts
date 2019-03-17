import * as ts from "ts-morph";
import {
	expressionModifiesVariable,
	getBindingData,
	placeInStatementIfExpression,
	transpileExpression,
	transpileStatement,
	transpileVariableDeclarationList,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { isArrayType, isNumberType, isStringType } from "../typeUtilities";
import { isIdentifierWhoseDefinitionMatchesNode } from "../utility";
import { getFirstMemberWithParameters } from "./function";
import { transpileNumericLiteral } from "./literal";

function hasContinueDescendant(node: ts.Node) {
	for (const child of node.getChildren()) {
		if (ts.TypeGuards.isContinueStatement(child)) {
			return true;
		}
		if (
			!(
				ts.TypeGuards.isForInStatement(child) ||
				ts.TypeGuards.isForOfStatement(child) ||
				ts.TypeGuards.isForStatement(child) ||
				ts.TypeGuards.isWhileStatement(child) ||
				ts.TypeGuards.isDoStatement(child)
			)
		) {
			if (hasContinueDescendant(child)) {
				return true;
			}
		}
	}
	return false;
}

export function transpileBreakStatement(state: TranspilerState, node: ts.BreakStatement) {
	return state.indent + "break;\n";
}

export function transpileContinueStatement(state: TranspilerState, node: ts.ContinueStatement) {
	return state.indent + `_continue_${state.continueId} = true; break;\n`;
}

export function transpileLoopBody(state: TranspilerState, node: ts.Statement) {
	const hasContinue = hasContinueDescendant(node);

	let endsWithBreakOrReturn = false;
	if (ts.TypeGuards.isBlock(node)) {
		const statements = node.getStatements();
		const lastStatement = statements[statements.length - 1];
		if (lastStatement) {
			if (ts.TypeGuards.isBreakStatement(lastStatement) || ts.TypeGuards.isReturnStatement(lastStatement)) {
				endsWithBreakOrReturn = true;
			}
		}
	}

	let result = "";
	if (hasContinue) {
		state.continueId++;
		result += state.indent + `local _continue_${state.continueId} = false;\n`;
		result += state.indent + `repeat\n`;
		state.pushIndent();
	}

	result += transpileStatement(state, node);

	if (hasContinue) {
		if (!endsWithBreakOrReturn) {
			result += state.indent + `_continue_${state.continueId} = true;\n`;
		}
		state.popIndent();
		result += state.indent + `until true;\n`;
		result += state.indent + `if not _continue_${state.continueId} then\n`;
		state.pushIndent();
		result += state.indent + `break;\n`;
		state.popIndent();
		result += state.indent + `end\n`;
		state.continueId--;
	}

	return result;
}

export function transpileDoStatement(state: TranspilerState, node: ts.DoStatement) {
	const condition = transpileExpression(state, node.getExpression());
	let result = "";
	result += state.indent + "repeat\n";
	state.pushIndent();
	result += transpileLoopBody(state, node.getStatement());
	state.popIndent();
	result += state.indent + `until not (${condition});\n`;
	return result;
}

function isCallExpressionOverridable(node: ts.Expression<ts.ts.Expression>) {
	if (ts.TypeGuards.isCallExpression(node)) {
		const exp = node.getExpression();
		if (ts.TypeGuards.isPropertyAccessExpression(exp)) {
			const subExpType = exp.getExpression().getType();
			return isStringType(subExpType) && exp.getName() === "gmatch";
		}
	}
	return false;
}

export function transpileForInStatement(state: TranspilerState, node: ts.ForInStatement) {
	state.pushIdStack();
	const init = node.getInitializer();
	let varName = "";
	const initializers = new Array<string>();
	if (ts.TypeGuards.isVariableDeclarationList(init)) {
		for (const declaration of init.getDeclarations()) {
			const lhs = declaration.getChildAtIndex(0);
			if (ts.TypeGuards.isArrayBindingPattern(lhs) || ts.TypeGuards.isObjectBindingPattern(lhs)) {
				throw new TranspilerError(
					`ForIn Loop did not expect binding pattern!`,
					init,
					TranspilerErrorType.UnexpectedBindingPattern,
				);
			} else if (ts.TypeGuards.isIdentifier(lhs)) {
				varName = lhs.getText();
			}
		}
	} else if (ts.TypeGuards.isExpression(init)) {
		const initKindName = init.getKindName();
		throw new TranspilerError(
			`ForIn Loop did not expect expression initializer! (${initKindName})`,
			init,
			TranspilerErrorType.UnexpectedInitializer,
		);
	}

	if (varName.length === 0) {
		throw new TranspilerError(`ForIn Loop empty varName!`, init, TranspilerErrorType.ForEmptyVarName);
	}

	const exp = node.getExpression();
	const expStr = transpileExpression(state, exp);
	let result = "";

	if (isCallExpressionOverridable(exp)) {
		result += state.indent + `for ${varName} in ${expStr} do\n`;
	} else if (isArrayType(exp.getType())) {
		result += state.indent + `for ${varName} = 0, #${expStr} - 1 do\n`;
	} else {
		result += state.indent + `for ${varName} in pairs(${expStr}) do\n`;
	}

	state.pushIndent();
	initializers.forEach(initializer => (result += state.indent + initializer + "\n"));
	result += transpileLoopBody(state, node.getStatement());
	state.popIndent();
	result += state.indent + `end;\n`;
	state.popIdStack();
	return result;
}

export function transpileForOfStatement(state: TranspilerState, node: ts.ForOfStatement) {
	state.pushIdStack();
	const init = node.getInitializer();
	let lhs: ts.Node<ts.ts.Node> | undefined;
	let varName = "";
	const initializers = new Array<string>();
	if (ts.TypeGuards.isVariableDeclarationList(init)) {
		for (const declaration of init.getDeclarations()) {
			lhs = declaration.getChildAtIndex(0);
			if (ts.TypeGuards.isArrayBindingPattern(lhs) || ts.TypeGuards.isObjectBindingPattern(lhs)) {
				varName = state.getNewId();
				const names = new Array<string>();
				const values = new Array<string>();
				const preStatements = new Array<string>();
				const postStatements = new Array<string>();
				getBindingData(state, names, values, preStatements, postStatements, lhs, varName);
				preStatements.forEach(myStatement => initializers.push(myStatement));
				const namesStr = names.join(", ");
				const valuesStr = values.join(", ");
				initializers.push(`local ${namesStr} = ${valuesStr};\n`);
				postStatements.forEach(myStatement => initializers.push(myStatement));
			} else if (ts.TypeGuards.isIdentifier(lhs)) {
				varName = lhs.getText();
			}
		}
	} else if (ts.TypeGuards.isExpression(init)) {
		const initKindName = init.getKindName();
		throw new TranspilerError(
			`ForOf Loop did not expect expression initializer! (${initKindName})`,
			init,
			TranspilerErrorType.UnexpectedInitializer,
		);
	}

	if (varName.length === 0) {
		throw new TranspilerError(`ForOf Loop empty varName!`, init, TranspilerErrorType.ForEmptyVarName);
	}

	const statement = node.getStatement();
	const exp = node.getExpression();
	let expStr = transpileExpression(state, exp);
	let result = "";

	if (isArrayType(exp.getType())) {
		let varValue: string;

		if (!ts.TypeGuards.isIdentifier(exp)) {
			const arrayName = state.getNewId();
			result += state.indent + `local ${arrayName} = ${expStr};\n`;
			expStr = arrayName;
		}
		const myInt = state.getNewId();
		result += state.indent + `for ${myInt} = 1, #${expStr} do\n`;
		state.pushIndent();
		varValue = `${expStr}[${myInt}]`;
		result += state.indent + `local ${varName} = ${varValue};\n`;
	} else {
		result += state.indent + `for _, ${varName} in pairs(${expStr}) do\n`;
		state.pushIndent();
	}

	initializers.forEach(initializer => (result += state.indent + initializer));
	result += transpileLoopBody(state, statement);
	state.popIndent();
	result += state.indent + `end;\n`;
	state.popIdStack();

	return result;
}

export function checkLoopClassExp(node?: ts.Expression<ts.ts.Expression>) {
	if (node && ts.TypeGuards.isClassExpression(node)) {
		throw new TranspilerError(
			"Loops cannot contain class expressions as their condition/init/incrementor!",
			node,
			TranspilerErrorType.ClassyLoop,
		);
	}
}

function isExpressionConstantNumbers(node: ts.Node) {
	return (
		node.getChildren().length > 0 &&
		node
			.getChildren()
			.every(
				child =>
					isConstantNumberVariableOrLiteral(child) ||
					child.getKind() === ts.SyntaxKind.PlusToken ||
					child.getKind() === ts.SyntaxKind.MinusToken ||
					child.getKind() === ts.SyntaxKind.AsteriskToken ||
					child.getKind() === ts.SyntaxKind.SlashToken ||
					child.getKind() === ts.SyntaxKind.AsteriskAsteriskToken ||
					child.getKind() === ts.SyntaxKind.PercentToken ||
					(ts.TypeGuards.isPrefixUnaryExpression(child) &&
						child.getOperatorToken() === ts.SyntaxKind.MinusToken),
			)
	);
}

function getSignAndIncrementorForStatement(
	state: TranspilerState,
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
					forIntervalStr = transpileNumericLiteral(state, rhsIncr);
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
	state: TranspilerState,
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
	state: TranspilerState,
	incrementor: ts.Expression<ts.ts.Expression>,
	incrementorStr: string,
) {
	if (ts.TypeGuards.isExpression(incrementor)) {
		checkLoopClassExp(incrementor);
	}
	return state.indent + placeInStatementIfExpression(state, incrementor, incrementorStr);
}

function getSimpleForLoopString(
	state: TranspilerState,
	initializer: ts.VariableDeclarationList,
	forLoopVars: string,
	statement: ts.Statement<ts.ts.Statement>,
) {
	let result = "";
	state.popIndent();
	const first = transpileVariableDeclarationList(state, initializer)
		.trim()
		.replace(/^local /, "")
		.replace(/;$/, "");

	result = state.indent + `for ${first}, ${forLoopVars} do\n`;
	state.pushIndent();
	result += transpileLoopBody(state, statement);
	state.popIndent();
	result += state.indent + `end;\n`;
	return result;
}

function isConstantNumberVariableOrLiteral(condValue: ts.Node) {
	return (
		ts.TypeGuards.isNumericLiteral(condValue) ||
		(ts.TypeGuards.isIdentifier(condValue) &&
			condValue.getDefinitions().every(a => {
				const declNode = a.getDeclarationNode();
				if (declNode && ts.TypeGuards.isVariableDeclaration(declNode)) {
					const declParent = declNode.getParent();
					if (ts.TypeGuards.isVariableDeclarationList(declParent)) {
						return declParent.getDeclarationKind() === ts.VariableDeclarationKind.Const;
					}
				}
				return false;
			}) &&
			isNumberType(condValue.getType()))
	);
}

export function transpileForStatement(state: TranspilerState, node: ts.ForStatement) {
	state.pushIdStack();
	const statement = node.getStatement();
	const condition = node.getCondition();
	checkLoopClassExp(condition);
	const incrementor = node.getIncrementor();
	checkLoopClassExp(incrementor);

	let result = "";
	let localizations = "";
	const cleanups = new Array<() => void>();
	result += state.indent + "do\n";
	state.pushIndent();
	const initializer = node.getInitializer();
	let conditionStr: string | undefined;
	let incrementorStr: string | undefined;

	if (initializer) {
		if (
			ts.TypeGuards.isVariableDeclarationList(initializer) &&
			initializer.getDeclarationKind() === ts.VariableDeclarationKind.Let
		) {
			const declarations = initializer.getDeclarations();
			const statementDescendants = statement.getDescendants();

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
									// if (
									// 	ts.TypeGuards.isPostfixUnaryExpression(incrementor) ||
									// 	(ts.TypeGuards.isPrefixUnaryExpression(incrementor) &&
									// 		(incrementor.getOperatorToken() === ts.SyntaxKind.PlusPlusToken ||
									// 			incrementor.getOperatorToken() === ts.SyntaxKind.MinusMinusToken))
									// ) {
									// }
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
													transpileExpression(state, condValue) +
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

			// if we can't convert to a simple for loop:
			// if it has any internal function declarations, make sure to locally scope variables
			if (getFirstMemberWithParameters(statementDescendants)) {
				conditionStr = condition ? transpileExpression(state, condition) : "true";
				incrementorStr = incrementor ? transpileExpression(state, incrementor) + ";\n" : undefined;

				declarations.forEach(declaration => {
					const lhs = declaration.getChildAtIndex(0);

					if (ts.TypeGuards.isIdentifier(lhs)) {
						const name = lhs.getText();
						const isLoopVarModified = statementDescendants.some(statementDescendant =>
							expressionModifiesVariable(statementDescendant, lhs),
						);
						const alias = state.getNewId();
						state.pushIndent();
						localizations += state.indent + `local ${alias} = ${name};\n`;
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

			result += transpileVariableDeclarationList(state, initializer);
		} else if (ts.TypeGuards.isExpression(initializer)) {
			const expStr = transpileExpression(state, initializer);
			result += safelyHandleExpressionsInForStatement(state, initializer, expStr) + ";\n";
		}
	}

	// order matters
	if (conditionStr === undefined) {
		conditionStr = condition ? transpileExpression(state, condition) : "true";
		incrementorStr = incrementor ? transpileExpression(state, incrementor) + ";\n" : undefined;
	}

	result += state.indent + `while ${conditionStr} do\n`;
	result += localizations;
	state.pushIndent();
	result += transpileLoopBody(state, statement);
	cleanups.forEach(cleanup => cleanup());
	if (incrementor && incrementorStr) {
		result += safelyHandleExpressionsInForStatement(state, incrementor, incrementorStr);
	}
	state.popIndent();
	result += state.indent + "end;\n";
	state.popIndent();
	result += state.indent + `end;\n`;
	state.popIdStack();
	return result;
}

export function transpileWhileStatement(state: TranspilerState, node: ts.WhileStatement) {
	const exp = node.getExpression();
	checkLoopClassExp(exp);
	const expStr = transpileExpression(state, exp);
	let result = "";
	result += state.indent + `while ${expStr} do\n`;
	state.pushIndent();
	result += transpileLoopBody(state, node.getStatement());
	state.popIndent();
	result += state.indent + `end;\n`;
	return result;
}

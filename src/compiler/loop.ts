import * as ts from "ts-morph";
import {
	compileExpression,
	compileStatement,
	compileVariableDeclarationList,
	expressionModifiesVariable,
	getBindingData,
	placeIncrementorInStatementIfExpression,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { isArrayType, isIterableIterator, isMapType, isNumberType, isSetType, isStringType } from "../typeUtilities";
import { isIdentifierWhoseDefinitionMatchesNode } from "../utility";
import { concatNamesAndValues } from "./binding";
import { getFirstMemberWithParameters } from "./function";
import { compileNumericLiteral } from "./literal";

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

export function compileBreakStatement(state: CompilerState, node: ts.BreakStatement) {
	return state.indent + "break;\n";
}

export function compileContinueStatement(state: CompilerState, node: ts.ContinueStatement) {
	return state.indent + `_continue_${state.continueId} = true; break;\n`;
}

export function compileLoopBody(state: CompilerState, node: ts.Statement) {
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

	result += compileStatement(state, node);

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

export function compileDoStatement(state: CompilerState, node: ts.DoStatement) {
	const condition = compileExpression(state, node.getExpression());
	let result = "";
	result += state.indent + "repeat\n";
	state.pushIndent();
	result += state.indent + "do\n";
	state.pushIndent();
	result += compileLoopBody(state, node.getStatement());
	state.popIndent();
	result += state.indent + "end\n";
	state.popIndent();
	result += state.indent + `until not (${condition});\n`;
	return result;
}

function getVariableName(
	state: CompilerState,
	lhs: ts.Node,
	names: Array<string>,
	values: Array<string>,
	preStatements: Array<string>,
	postStatements: Array<string>,
) {
	let varName: string;
	if (ts.TypeGuards.isArrayBindingPattern(lhs) || ts.TypeGuards.isObjectBindingPattern(lhs)) {
		varName = state.getNewId();
		getBindingData(state, names, values, preStatements, postStatements, lhs, varName);
	} else if (ts.TypeGuards.isIdentifier(lhs)) {
		varName = lhs.getText();
	} else {
		throw new CompilerError("Unexpected for..of initializer", lhs, CompilerErrorType.BadForOfInitializer);
	}

	return varName;
}

export function compileForOfStatement(state: CompilerState, node: ts.ForOfStatement) {
	state.pushIdStack();
	const init = node.getInitializer();
	let lhs: ts.Node<ts.ts.Node> | undefined;
	let varName = "";
	const statement = node.getStatement();
	const exp = node.getExpression();
	const expType = exp.getType();
	let result = "";
	let expStr = compileExpression(state, exp);

	if (ts.TypeGuards.isVariableDeclarationList(init)) {
		const declarations = init.getDeclarations();

		if (declarations.length !== 1) {
			throw new CompilerError(
				"Expected a single declaration in ForOf loop",
				init,
				CompilerErrorType.BadForOfInitializer,
			);
		}

		lhs = declarations[0].getChildAtIndex(0);

		const names = new Array<string>();
		const values = new Array<string>();
		const preStatements = new Array<string>();
		const postStatements = new Array<string>();

		if (isMapType(expType)) {
			if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
				const syntaxList = lhs.getChildAtIndex(1);

				if (ts.TypeGuards.isSyntaxList(syntaxList)) {
					const syntaxChildren = syntaxList.getChildren();
					const first = syntaxChildren[0];
					let key: string | undefined;
					let value: string | undefined;

					if (first) {
						if (!ts.TypeGuards.isOmittedExpression(first)) {
							key = getVariableName(
								state,
								first.getChildAtIndex(0),
								names,
								values,
								preStatements,
								postStatements,
							);
						}
					}

					if (syntaxChildren[1] && syntaxChildren[1].getKind() === ts.SyntaxKind.CommaToken) {
						const third = syntaxChildren[2];
						if (third) {
							if (!ts.TypeGuards.isOmittedExpression(third)) {
								value = getVariableName(
									state,
									third.getChildAtIndex(0),
									names,
									values,
									preStatements,
									postStatements,
								);
							}
						}
					}

					result += state.indent + `for ${key || "_"}${value ? `, ${value}` : ""} in pairs(${expStr}) do\n`;
					state.pushIndent();
				} else {
					throw new CompilerError(
						"Unexpected for..of initializer",
						lhs,
						CompilerErrorType.BadForOfInitializer,
					);
				}
			} else {
				if (!ts.TypeGuards.isIdentifier(lhs)) {
					throw new CompilerError(
						"Unexpected for..of initializer",
						lhs,
						CompilerErrorType.BadForOfInitializer,
					);
				}
				const key = state.getNewId();
				const value = state.getNewId();
				result += state.indent + `for ${key}, ${value} in pairs(${expStr}) do\n`;
				state.pushIndent();
				result += state.indent + `local ${lhs.getText()} = {${key}, ${value}};\n`;
			}
		} else {
			varName = getVariableName(state, lhs, names, values, preStatements, postStatements);

			if (varName.length === 0) {
				throw new CompilerError(`ForOf Loop empty varName!`, init, CompilerErrorType.ForEmptyVarName);
			}

			if (isArrayType(expType)) {
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
			} else if (isStringType(expType)) {
				if (ts.TypeGuards.isStringLiteral(exp)) {
					expStr = `(${expStr})`;
				}
				result += state.indent + `for ${varName} in ${expStr}:gmatch(".") do\n`;
				state.pushIndent();
			} else if (isSetType(expType)) {
				result += state.indent + `for ${varName} in pairs(${expStr}) do\n`;
				state.pushIndent();
			} else if (isIterableIterator(expType, exp)) {
				const loopVar = state.getNewId();
				result += state.indent + `for ${loopVar} in ${expStr}.next do\n`;
				state.pushIndent();
				result += state.indent + `if ${loopVar}.done then break end;\n`;
				result += state.indent + `local ${varName} = ${loopVar}.value;\n`;
			} else {
				result += state.indent + `for ${varName} in ${expStr} do\n`;
				state.pushIndent();
			}
		}

		for (const myStatement of preStatements) {
			result += state.indent + myStatement + "\n";
		}
		concatNamesAndValues(state, names, values, true, str => {
			result += str;
		});
		for (const myStatement of postStatements) {
			result += state.indent + myStatement + "\n";
		}
		result += compileLoopBody(state, statement);
		state.popIndent();
		result += state.indent + `end;\n`;
		state.popIdStack();
		return result;
	} else {
		const initKindName = init.getKindName();
		throw new CompilerError(
			`ForOf Loop has an unexpected initializer! (${initKindName})`,
			init,
			CompilerErrorType.UnexpectedInitializer,
		);
	}
}

export function checkLoopClassExp(node?: ts.Expression<ts.ts.Expression>) {
	if (node && ts.TypeGuards.isClassExpression(node)) {
		throw new CompilerError(
			"Loops cannot contain class expressions as their condition/init/incrementor!",
			node,
			CompilerErrorType.ClassyLoop,
		);
	}
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
) {
	if (ts.TypeGuards.isExpression(incrementor)) {
		checkLoopClassExp(incrementor);
	}
	return state.indent + placeIncrementorInStatementIfExpression(state, incrementor, incrementorStr);
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

export function compileForStatement(state: CompilerState, node: ts.ForStatement) {
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

			// if we can't convert to a simple for loop:
			// if it has any internal function declarations, make sure to locally scope variables
			if (getFirstMemberWithParameters(statementDescendants)) {
				conditionStr = condition ? compileExpression(state, condition) : "true";
				incrementorStr = incrementor ? compileExpression(state, incrementor) + ";\n" : undefined;

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

			result += compileVariableDeclarationList(state, initializer);
		} else if (ts.TypeGuards.isExpression(initializer)) {
			const expStr = compileExpression(state, initializer);
			result += safelyHandleExpressionsInForStatement(state, initializer, expStr) + ";\n";
		}
	}

	// order matters
	if (conditionStr === undefined) {
		conditionStr = condition ? compileExpression(state, condition) : "true";
		incrementorStr = incrementor ? compileExpression(state, incrementor) + ";\n" : undefined;
	}

	result += state.indent + `while ${conditionStr} do\n`;
	result += localizations;
	state.pushIndent();
	result += compileLoopBody(state, statement);
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

export function compileWhileStatement(state: CompilerState, node: ts.WhileStatement) {
	const exp = node.getExpression();
	checkLoopClassExp(exp);
	const expStr = compileExpression(state, exp);
	let result = "";
	result += state.indent + `while ${expStr} do\n`;
	state.pushIndent();
	result += compileLoopBody(state, node.getStatement());
	state.popIndent();
	result += state.indent + `end;\n`;
	return result;
}

import * as ts from "ts-morph";
import {
	getBindingData,
	isBindingPattern,
	transpileExpression,
	transpileStatement,
	transpileVariableDeclarationList,
} from ".";
import { TranspilerError, TranspilerErrorType } from "../errors/TranspilerError";
import { TranspilerState } from "../TranspilerState";
import { HasParameters } from "../types";
import { isArrayType, isNumberType, isStringType } from "../typeUtilities";
import { isSetToken } from "./binary";

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
	if (node.getLabel()) {
		throw new TranspilerError("Break labels are not supported!", node, TranspilerErrorType.NoLabeledStatement);
	}
	return state.indent + "break;\n";
}

export function transpileContinueStatement(state: TranspilerState, node: ts.ContinueStatement) {
	if (node.getLabel()) {
		throw new TranspilerError("Continue labels are not supported!", node, TranspilerErrorType.NoLabeledStatement);
	}
	return state.indent + `_continue_${state.continueId} = true; break;\n`;
}

export function transpileLoopBody(state: TranspilerState, node: ts.Statement) {
	const hasContinue = hasContinueDescendant(node);

	let result = "";
	if (hasContinue) {
		state.continueId++;
		result += state.indent + `local _continue_${state.continueId} = false;\n`;
		result += state.indent + `repeat\n`;
		state.pushIndent();
	}

	result += transpileStatement(state, node);

	if (hasContinue) {
		result += state.indent + `_continue_${state.continueId} = true;\n`;
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

function getFirstMemberWithParameters(nodes: Array<ts.Node<ts.ts.Node>>): HasParameters | undefined {
	for (const node of nodes) {
		if (
			ts.TypeGuards.isFunctionExpression(node) ||
			ts.TypeGuards.isArrowFunction(node) ||
			ts.TypeGuards.isFunctionDeclaration(node) ||
			ts.TypeGuards.isConstructorDeclaration(node) ||
			ts.TypeGuards.isMethodDeclaration(node) ||
			ts.TypeGuards.isGetAccessorDeclaration(node) ||
			ts.TypeGuards.isSetAccessorDeclaration(node)
		) {
			return node;
		}
	}
	return undefined;
}

export function transpileForInStatement(state: TranspilerState, node: ts.ForInStatement) {
	state.pushIdStack();
	const init = node.getInitializer();
	let varName = "";
	const initializers = new Array<string>();
	if (ts.TypeGuards.isVariableDeclarationList(init)) {
		for (const declaration of init.getDeclarations()) {
			const lhs = declaration.getChildAtIndex(0);
			if (isBindingPattern(lhs)) {
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
		const parentFunction = getFirstMemberWithParameters(node.getAncestors());

		if (parentFunction && state.canOptimizeParameterTuple.get(parentFunction) === expStr) {
			result += state.indent + `for ${varName} = 0, select("#", ...) - 1 do\n`;
		} else {
			result += state.indent + `for ${varName} = 0, #${expStr} - 1 do\n`;
		}
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
			if (isBindingPattern(lhs)) {
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
	let wasSet = false;
	let previous: string | undefined;

	if (isArrayType(exp.getType())) {
		const parentFunction = getFirstMemberWithParameters(node.getAncestors());
		// If we are uncertain for some reason, fallback on old behavior
		let count = 2;

		// If identifier only shows up once, don't localize
		if (lhs && ts.TypeGuards.isIdentifier(lhs)) {
			count = 0;
			statement.getDescendantsOfKind(ts.SyntaxKind.Identifier).forEach(identifier => {
				if (isIdentifierWhoseDefinitionMatchesNode(identifier, lhs as ts.Identifier)) {
					++count;
				}
			});
		}

		let varValue: string;

		if (parentFunction && state.canOptimizeParameterTuple.get(parentFunction) === expStr) {
			const myInt = count === 0 ? "_" : state.getNewId();
			result += state.indent + `for ${myInt} = 1, select("#", ...) do\n`;
			state.pushIndent();
			varValue = `select(${myInt}, ...)`;
			if (count === 1) {
				varValue = `(${varValue})`;
			}
		} else {
			if (!ts.TypeGuards.isIdentifier(exp)) {
				const arrayName = state.getNewId();
				result += state.indent + `local ${arrayName} = ${expStr};\n`;
				expStr = arrayName;
			}
			const myInt = count === 0 ? "_" : state.getNewId();
			result += state.indent + `for ${myInt} = 1, #${expStr} do\n`;
			state.pushIndent();
			varValue = `${expStr}[${myInt}]`;
		}

		if (count > 1) {
			result += state.indent + `local ${varName} = ${varValue};\n`;
		} else if (count === 1) {
			wasSet = true;
			previous = state.variableAliases.get(varName);
			state.variableAliases.set(varName, varValue);
		}
	} else {
		result += state.indent + `for _, ${varName} in pairs(${expStr}) do\n`;
		state.pushIndent();
	}

	initializers.forEach(initializer => (result += state.indent + initializer));
	result += transpileLoopBody(state, statement);
	state.popIndent();
	result += state.indent + `end;\n`;
	state.popIdStack();

	if (wasSet) {
		if (previous) {
			state.variableAliases.set(varName, previous);
		} else {
			state.variableAliases.delete(varName);
		}
	}

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

function isIdentifierWhoseDefinitionMatchesNode(
	node: ts.Node<ts.ts.Node>,
	potentialDefinition: ts.Identifier,
): node is ts.Identifier {
	if (ts.TypeGuards.isIdentifier(node)) {
		for (const def of node.getDefinitions()) {
			if (def.getNode() === potentialDefinition) {
				return true;
			}
		}
	}
	return false;
}

function expressionModifiesVariable(
	node: ts.Node<ts.ts.Node>,
	lhs?: ts.Identifier,
): node is ts.BinaryExpression | ts.PrefixUnaryExpression | ts.PostfixUnaryExpression {
	if (
		ts.TypeGuards.isPostfixUnaryExpression(node) ||
		(ts.TypeGuards.isPrefixUnaryExpression(node) &&
			(node.getOperatorToken() === ts.SyntaxKind.PlusPlusToken ||
				node.getOperatorToken() === ts.SyntaxKind.MinusMinusToken))
	) {
		if (lhs) {
			return isIdentifierWhoseDefinitionMatchesNode(node.getOperand(), lhs);
		} else {
			return true;
		}
	} else if (ts.TypeGuards.isBinaryExpression(node) && isSetToken(node.getOperatorToken().getKind())) {
		if (lhs) {
			return isIdentifierWhoseDefinitionMatchesNode(node.getLeft(), lhs);
		} else {
			return true;
		}
	}
	return false;
}

function getSignAndValueInForStatement(
	incrementor: ts.BinaryExpression | ts.PrefixUnaryExpression | ts.PostfixUnaryExpression,
) {
	let forIntervalStr = "";
	let sign = "";
	if (ts.TypeGuards.isBinaryExpression(incrementor)) {
		const sibling = incrementor.getChildAtIndex(0).getNextSibling();
		if (sibling) {
			let rhsIncr = sibling.getNextSibling();

			if (rhsIncr) {
				if (isNumberType(rhsIncr.getType())) {
					if (sibling.getKind() === ts.SyntaxKind.EqualsToken && ts.TypeGuards.isBinaryExpression(rhsIncr)) {
						// incrementor is something like i = i + 1
						const sib1 = rhsIncr.getChildAtIndex(0).getNextSibling();

						if (sib1) {
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

				if (rhsIncr && rhsIncr.getType().isNumberLiteral()) {
					forIntervalStr = rhsIncr.getText();
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

export function getLimitInForStatement(
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

export function safelyHandleExpressionsInForStatement(
	state: TranspilerState,
	incrementor: ts.Expression<ts.ts.Expression>,
	incrementorStr: string,
) {
	if (ts.TypeGuards.isExpression(incrementor)) {
		checkLoopClassExp(incrementor);

		if (
			!ts.TypeGuards.isCallExpression(incrementor) &&
			!expressionModifiesVariable(incrementor) &&
			!ts.TypeGuards.isVariableDeclarationList(incrementor)
		) {
			incrementorStr = `local _ = ` + incrementorStr;
		}
	}
	return state.indent + incrementorStr;
}

export function getSimpleForLoopString(
	state: TranspilerState,
	first: string,
	forLoopVars: string,
	statement: ts.Statement<ts.ts.Statement>,
) {
	let result = "";
	state.popIndent();
	result = state.indent + `for ${first}, ${forLoopVars} do\n`;
	state.pushIndent();
	result += transpileLoopBody(state, statement);
	state.popIndent();
	result += state.indent + `end;\n`;
	return result;
}

export function transpileForStatement(state: TranspilerState, node: ts.ForStatement) {
	state.pushIdStack();
	const statement = node.getStatement();
	const condition = node.getCondition();
	checkLoopClassExp(condition);
	const conditionStr = condition ? transpileExpression(state, condition) : "true";
	const incrementor = node.getIncrementor();
	checkLoopClassExp(incrementor);
	const incrementorStr = incrementor ? transpileExpression(state, incrementor) + ";\n" : undefined;

	let result = "";
	let localizations = "";
	let cleanup = () => {};
	result += state.indent + "do\n";
	state.pushIndent();
	const initializer = node.getInitializer();

	if (initializer) {
		if (
			ts.TypeGuards.isVariableDeclarationList(initializer) &&
			initializer.getDeclarationKind() === ts.VariableDeclarationKind.Let
		) {
			const declarations = initializer.getDeclarations();
			const statementDescendants = statement.getDescendants();

			if (declarations.length > 0) {
				const lhs = declarations[0].getChildAtIndex(0);
				if (ts.TypeGuards.isIdentifier(lhs)) {
					const name = lhs.getText();
					let isLoopVarModified = false;
					for (const statementDescendant of statementDescendants) {
						if (expressionModifiesVariable(statementDescendant, lhs)) {
							isLoopVarModified = true;
							break;
						}
					}

					const nextSibling = lhs.getNextSibling();

					if (
						declarations.length === 1 &&
						!isLoopVarModified &&
						incrementor &&
						incrementorStr &&
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
								let first = transpileVariableDeclarationList(state, initializer);
								first = first.substr(7, first.length - 9);

								if (expressionModifiesVariable(incrementor, lhs)) {
									let [incrSign, incrValue] = getSignAndValueInForStatement(incrementor);
									if (incrSign) {
										const [condSign, condValue] = getLimitInForStatement(state, condition, lhs);
										if (condValue && condValue.getType().isNumberLiteral()) {
											if (incrSign === "+" && condSign === "<=") {
												const forLoopVars =
													condValue.getText() + (incrValue === "1" ? "" : ", " + incrValue);
												return getSimpleForLoopString(state, first, forLoopVars, statement);
											} else if (incrSign === "-" && condSign === ">=") {
												incrValue = (incrSign + incrValue).replace("--", "");
												incrSign = "";
												const forLoopVars = condValue.getText() + ", " + incrValue;
												return getSimpleForLoopString(state, first, forLoopVars, statement);
											}
										}
									}
								}
							}
						}
					}

					// if we can't convert to a simple for loop:
					// if it has any internal function declarataions, make sure to locally scope variables
					if (getFirstMemberWithParameters(statementDescendants)) {
						const alias = state.getNewId();
						state.pushIndent();
						localizations = state.indent + `local ${alias} = ${name};\n`;
						state.popIndent();

						// don't leak
						const previous = state.variableAliases.get(name);

						cleanup = () => {
							if (previous) {
								state.variableAliases.set(name, previous);
							} else {
								state.variableAliases.delete(name);
							}

							if (isLoopVarModified) {
								result += state.indent + `${name} = ${alias};\n`;
							}
						};

						state.variableAliases.set(name, alias);
					}
				}
			}

			result += transpileVariableDeclarationList(state, initializer);
		} else if (ts.TypeGuards.isExpression(initializer)) {
			const expStr = transpileExpression(state, initializer);
			result += safelyHandleExpressionsInForStatement(state, initializer, expStr) + ";\n";
		}
	}

	result += state.indent + `while ${conditionStr} do\n`;
	result += localizations;
	state.pushIndent();
	result += transpileLoopBody(state, statement);
	cleanup();
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

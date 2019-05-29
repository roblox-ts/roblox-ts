import * as ts from "ts-morph";
import {
	compileExpression,
	compileLoopBody,
	concatNamesAndValues,
	getBindingData,
	getPropertyAccessExpressionType,
	getReadableExpressionName,
	PropertyCallExpType,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	isArrayType,
	isIterableFunction,
	isIterableIterator,
	isMapType,
	isSetType,
	isStringType,
} from "../typeUtilities";
import { getNonNullUnParenthesizedExpressionDownwards } from "../utility";

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
	let exp = getNonNullUnParenthesizedExpressionDownwards(node.getExpression());
	const expType = exp.getType();

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

		let isExpEntriesType = isMapType(expType);
		let isExpKeysType = isSetType(expType);
		let isExpValuesType = false;

		if (ts.TypeGuards.isCallExpression(exp)) {
			const subExp = exp.getExpression();
			if (ts.TypeGuards.isPropertyAccessExpression(subExp)) {
				if (PropertyCallExpType.ObjectConstructor === getPropertyAccessExpressionType(state, subExp)) {
					const subExpName = subExp.getName();
					const firstArg = exp.getArguments()[0] as ts.Expression;
					if (subExpName === "keys") {
						isExpKeysType = true;
						exp = firstArg;
					} else if (subExpName === "entries") {
						isExpEntriesType = true;
						exp = firstArg;
					} else if (subExpName === "values") {
						isExpValuesType = true;
						exp = firstArg;
					}
				}
			}
		}

		state.enterPrecedingStatementContext();
		let expStr = compileExpression(state, exp);
		let result = state.exitPrecedingStatementContextAndJoin();

		if (isExpEntriesType) {
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

			if (isExpKeysType) {
				result += state.indent + `for ${varName} in pairs(${expStr}) do\n`;
				state.pushIndent();
			} else if (isExpValuesType) {
				result += state.indent + `for _, ${varName} in pairs(${expStr}) do\n`;
				state.pushIndent();
			} else if (isArrayType(expType)) {
				let varValue: string;
				state.enterPrecedingStatementContext();
				expStr = getReadableExpressionName(state, exp, expStr);
				result += state.exitPrecedingStatementContextAndJoin();
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
			} else if (isIterableFunction(expType)) {
				result += state.indent + `for ${varName} in ${expStr} do\n`;
				state.pushIndent();
			} else {
				state.enterPrecedingStatementContext();
				if (!isIterableIterator(expType, exp)) {
					const expStrTemp = getReadableExpressionName(state, exp, expStr);
					expStr = `${expStrTemp}[TS.Symbol_iterator](${expStrTemp})`;
				}
				const loopVar = state.getNewId();
				result += state.exitPrecedingStatementContextAndJoin();
				result += state.indent + `for ${loopVar} in ${expStr}.next do\n`;
				state.pushIndent();
				result += state.indent + `if ${loopVar}.done then break end;\n`;
				result += state.indent + `local ${varName} = ${loopVar}.value;\n`;
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

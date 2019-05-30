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
import { checkReserved } from "./security";

function getVariableName(
	state: CompilerState,
	lhs: ts.Node,
	names: Array<string>,
	values: Array<string>,
	preStatements: Array<string>,
	postStatements: Array<string>,
) {
	if (lhs) {
		let varName = "";

		if (ts.TypeGuards.isArrayBindingPattern(lhs) || ts.TypeGuards.isObjectBindingPattern(lhs)) {
			varName = state.getNewId();
			getBindingData(state, names, values, preStatements, postStatements, lhs, varName);
		} else if (ts.TypeGuards.isIdentifier(lhs)) {
			varName = lhs.getText();
			checkReserved(varName, lhs);
		}

		if (varName) {
			return varName;
		}
	}

	throw new CompilerError("Unexpected for..of initializer", lhs, CompilerErrorType.BadForOfInitializer);
}

function asDeclarationListOrThrow(initializer: ts.VariableDeclarationList | ts.Expression) {
	if (!ts.TypeGuards.isVariableDeclarationList(initializer)) {
		const initKindName = initializer.getKindName();
		throw new CompilerError(
			`ForOf Loop has an unexpected initializer! (${initKindName})`,
			initializer,
			CompilerErrorType.UnexpectedInitializer,
		);
	}

	return initializer;
}

function getSingleDeclarationOrThrow(initializer: ts.VariableDeclarationList) {
	const declarations = initializer.getDeclarations();
	if (declarations.length !== 1) {
		throw new CompilerError(
			"Expected a single declaration in ForOf loop",
			initializer,
			CompilerErrorType.BadForOfInitializer,
		);
	}

	return declarations[0];
}

enum ForOfLoopType {
	Keys,
	Values,
	Entries,
	Array,
	ArrayEntries,
	String,
	IterableFunction,
	Symbol_iterator,
}

function* propertyAccessExpressionTypeIter(state: CompilerState, exp: ts.Expression) {
	while (ts.TypeGuards.isCallExpression(exp)) {
		const subExp = exp.getExpression();

		if (!ts.TypeGuards.isPropertyAccessExpression(subExp)) {
			break;
		}

		yield { exp: subExp, type: getPropertyAccessExpressionType(state, subExp) };
		exp = subExp.getExpression();
	}
}

function getLoopType(
	state: CompilerState,
	node: ts.ForOfStatement | ts.PropertyAccessExpression,
	reversed = false,
	backwards = false,
): [ts.Expression, ForOfLoopType, boolean, boolean] {
	const exp = node.getExpression();
	const expType = exp.getType();
	const iter = propertyAccessExpressionTypeIter(state, exp);
	let data = iter.next();

	if (!data.done) {
		let subExp = data.value.exp;
		switch (data.value.type) {
			case PropertyCallExpType.ObjectConstructor: {
				const iterExp = (exp as ts.CallExpression).getArguments()[0] as ts.Expression;

				switch (subExp.getName()) {
					case "keys":
						return [iterExp, ForOfLoopType.Keys, reversed, backwards];
					case "entries":
						return [iterExp, ForOfLoopType.Entries, reversed, backwards];
					case "values":
						return [iterExp, ForOfLoopType.Values, reversed, backwards];
				}
				break;
			}
			case PropertyCallExpType.Array: {
				switch (subExp.getName()) {
					case "entries": {
						do {
							subExp = data.value.exp;
							reversed = !reversed;
							data = iter.next();
						} while (
							!data.done &&
							(data.value.type === PropertyCallExpType.Array && data.value.exp.getName() === "reverse")
						);

						return [subExp.getExpression(), ForOfLoopType.ArrayEntries, !reversed, backwards];
					}
					case "reverse": {
						const [lowerExp, lowerLoopExpType, isReversed, isBackwards] = getLoopType(
							state,
							subExp,
							reversed,
							!backwards,
						);

						switch (lowerLoopExpType) {
							case ForOfLoopType.Array:
							case ForOfLoopType.ArrayEntries:
								return [lowerExp, lowerLoopExpType, isReversed, isBackwards];
						}

						return [subExp.getExpression(), ForOfLoopType.Array, reversed, !backwards];
					}
				}
				break;
			}
		}
	}

	if (isMapType(expType)) {
		return [exp, ForOfLoopType.Entries, reversed, backwards];
	} else if (isSetType(expType)) {
		return [exp, ForOfLoopType.Keys, reversed, backwards];
	} else if (isArrayType(expType)) {
		return [exp, ForOfLoopType.Array, reversed, backwards];
	} else if (isStringType(expType)) {
		return [exp, ForOfLoopType.String, reversed, backwards];
	} else if (isIterableFunction(expType)) {
		return [exp, ForOfLoopType.IterableFunction, reversed, backwards];
	} else {
		return [exp, ForOfLoopType.Symbol_iterator, reversed, backwards];
	}
}

export function compileForOfStatement(state: CompilerState, node: ts.ForOfStatement) {
	state.pushIdStack();
	state.enterPrecedingStatementContext();

	const initializer = asDeclarationListOrThrow(node.getInitializer());
	const declaration = getSingleDeclarationOrThrow(initializer);
	const statement = node.getStatement();
	const [exp, loopType, isReversed, isBackwards] = getLoopType(state, node);
	const lhs: ts.Node<ts.ts.Node> | undefined = declaration.getChildAtIndex(0);
	let varName: string;

	/** The key to be used in the for loop. If it is the empty string, it is irrelevant. */
	let key: string = "";
	/** The value to be used in the for loop. If it is the empty string, it is irrelevant. */
	let value: string = "";
	/** The expression to iterate through */
	let expStr = compileExpression(state, exp);
	let result = "";

	const names = new Array<string>();
	const values = new Array<string>();
	const preStatements = new Array<string>();
	const postStatements = new Array<string>();

	/** Whether we should iterate as a simple for loop (defaults to a for..in loop) */
	let isNumericForLoop = false;

	if (loopType === ForOfLoopType.Entries || loopType === ForOfLoopType.ArrayEntries) {
		if (loopType === ForOfLoopType.ArrayEntries) {
			expStr = getReadableExpressionName(state, exp, expStr);
			isNumericForLoop = true;
		} else {
			expStr = `pairs(${expStr})`;
		}

		if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
			const syntaxList = lhs.getChildAtIndex(1);

			if (ts.TypeGuards.isSyntaxList(syntaxList)) {
				const syntaxChildren = syntaxList.getChildren();
				const first = syntaxChildren[0];

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
			} else {
				throw new CompilerError("Unexpected for..of initializer", lhs, CompilerErrorType.BadForOfInitializer);
			}
		} else {
			if (!ts.TypeGuards.isIdentifier(lhs)) {
				throw new CompilerError("Unexpected for..of initializer", lhs, CompilerErrorType.BadForOfInitializer);
			}
			key = state.getNewId();
			value = state.getNewId();
			varName = getVariableName(state, lhs, names, values, preStatements, postStatements);
			preStatements.push(`local ${varName} = {${key}, ${value}};`);
		}
	} else {
		varName = getVariableName(state, lhs, names, values, preStatements, postStatements);

		switch (loopType) {
			case ForOfLoopType.Keys:
				key = varName;
				expStr = `pairs(${expStr})`;
				break;
			case ForOfLoopType.Values:
				value = varName;
				expStr = `pairs(${expStr})`;
				break;
			case ForOfLoopType.Array:
				value = varName;
				expStr = getReadableExpressionName(state, exp, expStr);
				isNumericForLoop = true;
				break;
			case ForOfLoopType.String:
				key = varName;
				expStr = `(${expStr}):gmatch(".")`;
				break;
			case ForOfLoopType.IterableFunction:
				key = varName;
				break;
			case ForOfLoopType.Symbol_iterator: {
				if (!isIterableIterator(exp.getType(), exp)) {
					expStr = getReadableExpressionName(state, exp, expStr);
					expStr = `${expStr}[TS.Symbol_iterator](${expStr})`;
				}
				const loopVar = state.getNewId();
				key = loopVar;
				expStr = `${expStr}.next`;
				preStatements.push(`if ${loopVar}.done then break end;`);
				preStatements.push(`local ${varName} = ${loopVar}.value;`);
				break;
			}
		}
	}

	if (isNumericForLoop) {
		let accessor: string;
		let loopEndValue: string = `#${expStr}`;

		if (key) {
			accessor =
				value && isReversed
					? `${(loopEndValue = state.pushPrecedingStatementToNewId(node, loopEndValue))} - ${key}`
					: `${key} + 1`;

			if (isBackwards) {
				result += state.indent + `for ${key} = ${loopEndValue} - 1, 0, -1 do\n`;
			} else {
				result += state.indent + `for ${key} = 0, ${loopEndValue} - 1 do\n`;
			}
		} else {
			accessor = state.getNewId();

			if (isReversed ? !isBackwards : isBackwards) {
				result += state.indent + `for ${accessor} = ${loopEndValue}, 1, -1 do\n`;
			} else {
				result += state.indent + `for ${accessor} = 1, ${loopEndValue} do\n`;
			}
		}

		state.pushIndent();

		if (value) {
			result += state.indent + `local ${value} = ${expStr}[${accessor}];\n`;
		}
	} else {
		result += state.indent + `for ${key || "_"}${value ? `, ${value}` : ""} in ${expStr} do\n`;
		state.pushIndent();
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
	return state.exitPrecedingStatementContextAndJoin() + result;
}

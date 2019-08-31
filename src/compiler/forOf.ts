import * as ts from "ts-morph";
import {
	checkReserved,
	compileBindingPattern,
	compileExpression,
	compileLoopBody,
	getPropertyAccessExpressionType,
	getReadableExpressionName,
	PropertyCallExpType,
} from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { skipNodesDownwards } from "../utility/general";
import {
	getType,
	isArrayType,
	isIterableFunctionType,
	isIterableIteratorType,
	isMapType,
	isSetType,
	isStringType,
} from "../utility/type";

function getVariableName(state: CompilerState, lhs: ts.Node, statements: Array<string>) {
	if (lhs) {
		let varName = "";

		if (ts.TypeGuards.isArrayBindingPattern(lhs) || ts.TypeGuards.isObjectBindingPattern(lhs)) {
			varName = state.getNewId();
			statements.push(...compileBindingPattern(state, lhs, varName));
		} else if (ts.TypeGuards.isIdentifier(lhs)) {
			varName = checkReserved(lhs);
		}

		if (varName) {
			return varName;
		}
	}

	throw new CompilerError("Unexpected for..of initializer", lhs, CompilerErrorType.BadForOfInitializer, true);
}

function asDeclarationListOrThrow(initializer: ts.VariableDeclarationList | ts.Expression) {
	if (!ts.TypeGuards.isVariableDeclarationList(initializer)) {
		const initKindName = initializer.getKindName();
		throw new CompilerError(
			`ForOf Loop has an unexpected initializer! (${initKindName})`,
			initializer,
			CompilerErrorType.UnexpectedInitializer,
			true,
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
			true,
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
	IterableLuaTuple,
}

function* propertyAccessExpressionTypeIter(state: CompilerState, exp: ts.Expression) {
	console.log(exp.getKindName(),exp.getText())
	while (ts.TypeGuards.isCallExpression(exp)) {
		const subExp = skipNodesDownwards(exp.getExpression());

		if (!ts.TypeGuards.isPropertyAccessExpression(subExp)) {
			break;
		}

		yield { exp: subExp, type: getPropertyAccessExpressionType(state, subExp) };
		exp = skipNodesDownwards(subExp.getExpression());
	}
}

function getLoopType(
	state: CompilerState,
	node: ts.ForOfStatement | ts.PropertyAccessExpression,
	reversed = false,
	backwards = false,
): [ts.Expression, ForOfLoopType, boolean, boolean] {
	const exp = skipNodesDownwards(node.getExpression());
	const expType = getType(exp);
	const iter = propertyAccessExpressionTypeIter(state, exp);
	let data = iter.next();

	if (!data.done) {
		let subExp = data.value.exp;
		switch (data.value.type) {
			case PropertyCallExpType.ObjectConstructor: {
				const iterExp = skipNodesDownwards((exp as ts.CallExpression).getArguments()[0] as ts.Expression);

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

						return [
							skipNodesDownwards(subExp.getExpression()),
							ForOfLoopType.ArrayEntries,
							!reversed,
							backwards,
						];
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

						return [skipNodesDownwards(subExp.getExpression()), ForOfLoopType.Array, reversed, !backwards];
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
	} else if (isIterableFunctionType(expType)) {
		// Hack
		if (expType.getText().match("<LuaTuple<")) {
			return [exp, ForOfLoopType.IterableLuaTuple, reversed, backwards];
		} else {
			return [exp, ForOfLoopType.IterableFunction, reversed, backwards];
		}
	} else {
		return [exp, ForOfLoopType.Symbol_iterator, reversed, backwards];
	}
}

export function compileForOfStatement(state: CompilerState, node: ts.ForOfStatement) {
	state.enterPrecedingStatementContext();

	const initializer = asDeclarationListOrThrow(node.getInitializer());
	const declaration = getSingleDeclarationOrThrow(initializer);
	const statement = node.getStatement();
	const [exp, loopType, isReversed, isBackwards] = getLoopType(state, node);
	const lhs = declaration.getNameNode();
	let varName: string;

	/** The key to be used in the for loop. If it is the empty string, it is irrelevant. */
	let key: string = "";
	/** The value to be used in the for loop. If it is the empty string, it is irrelevant. */
	let value: string = "";
	/** The expression to iterate through */
	let expStr = compileExpression(state, exp);
	let result = "";

	const extraParams = new Array<string>();

	const statements = new Array<string>();

	/** Whether we should iterate as a simple for loop (defaults to a for..in loop) */
	let isNumericForLoop = false;

	if (
		loopType === ForOfLoopType.Entries ||
		loopType === ForOfLoopType.ArrayEntries ||
		loopType === ForOfLoopType.IterableLuaTuple
	) {
		if (loopType === ForOfLoopType.ArrayEntries) {
			expStr = getReadableExpressionName(state, exp, expStr);
			isNumericForLoop = true;
		} else if (loopType === ForOfLoopType.Entries) {
			expStr = `pairs(${expStr})`;
		}

		if (ts.TypeGuards.isArrayBindingPattern(lhs)) {
			const elements = lhs.getElements();
			const [first, second] = elements as [
				ts.BindingElement | ts.OmittedExpression | undefined,
				ts.BindingElement | ts.OmittedExpression | undefined,
			];

			if (first && ts.TypeGuards.isBindingElement(first)) {
				key = getVariableName(state, first.getNameNode(), statements);
			}

			if (second && ts.TypeGuards.isBindingElement(second)) {
				value = getVariableName(state, second.getNameNode(), statements);
			}

			for (let i = 2, { length } = elements; i < length; i++) {
				const { [i]: element } = elements;

				extraParams.push(
					ts.TypeGuards.isBindingElement(element)
						? getVariableName(state, element.getNameNode(), statements)
						: "_",
				);
			}
		} else {
			if (loopType === ForOfLoopType.IterableLuaTuple) {
				throw new CompilerError(
					`Unexpected for..of initializer! \`${lhs.getText()}\` is a LuaTuple and should be destructured in-line!`,
					lhs,
					CompilerErrorType.BadForOfInitializer,
				);
			}

			if (!ts.TypeGuards.isIdentifier(lhs)) {
				throw new CompilerError("Unexpected for..of initializer", lhs, CompilerErrorType.BadForOfInitializer);
			}
			key = state.getNewId();
			value = state.getNewId();
			varName = getVariableName(state, lhs, statements);
			statements.unshift(`local ${varName} = {${key}, ${value}};`);
		}
	} else {
		varName = getVariableName(state, lhs, statements);

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
				expStr = `string.gmatch(${expStr}, "[%z\\1-\\127\\194-\\244][\\128-\\191]*")`;
				break;
			case ForOfLoopType.IterableFunction:
				key = varName;
				break;
			case ForOfLoopType.Symbol_iterator: {
				if (!isIterableIteratorType(getType(exp))) {
					expStr = getReadableExpressionName(state, exp, expStr);
					expStr = `${expStr}[TS.Symbol_iterator](${expStr})`;
				}
				const loopVar = state.getNewId();
				key = loopVar;
				expStr = `${expStr}.next`;
				statements.unshift(`if ${loopVar}.done then break end;`, `local ${varName} = ${loopVar}.value;`);
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
		if (extraParams.length > 0) {
			result += state.indent + `for ${[key || "_", value || "_", ...extraParams].join(", ")} in ${expStr} do\n`;
		} else {
			result += state.indent + `for ${key || "_"}${value ? `, ${value}` : ""} in ${expStr} do\n`;
		}
		state.pushIndent();
	}

	for (const myStatement of statements) {
		result += state.indent + myStatement + "\n";
	}
	state.pushIdStack();
	result += compileLoopBody(state, statement);
	state.popIndent();
	result += state.indent + `end;\n`;
	state.popIdStack();
	return state.exitPrecedingStatementContextAndJoin() + result;
}

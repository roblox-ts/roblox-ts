import * as ts from "ts-morph";
import { checkNonAny, compileCallExpression, compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import {
	isArrayType,
	isIterableIterator,
	isMapType,
	isSetType,
	isStringType,
	isTupleReturnTypeCall,
} from "../typeUtilities";

export function shouldCompileAsSpreadableList(elements: Array<ts.Expression>) {
	const { length } = elements;
	for (let i = 0; i < length; i++) {
		if (ts.TypeGuards.isSpreadElement(elements[i])) {
			return i + 1 !== length;
		}
	}
	return false;
}

// TODO: Make this compile properly
export function compileSpreadableList(state: CompilerState, elements: Array<ts.Expression>) {
	let isInArray = false;
	const parts = new Array<Array<string> | string>();

	for (let i = 0; i < elements.length; i++) {
		const element = elements[i];
		if (ts.TypeGuards.isSpreadElement(element)) {
			parts.push(compileSpreadExpressionOrThrow(state, element.getExpression()));
			isInArray = false;
		} else {
			checkNonAny(element);
			let last: Array<string>;
			if (isInArray) {
				last = parts[parts.length - 1] as Array<string>;
			} else {
				last = new Array<string>();
				parts.push(last);
			}
			last.push(compileExpression(state, element));
			isInArray = true;
		}
	}

	const params = parts
		.map(v => {
			return typeof v === "string" ? v : `{ ${v.join(", ")} }`;
		})
		.join(", ");

	state.usesTSLibrary = true;
	return `TS.array_concat(${params})`;
}

export function compileSpreadExpression(state: CompilerState, expression: ts.Expression) {
	const expType = expression.getType();
	if (isSetType(expType)) {
		state.usesTSLibrary = true;
		return `TS.set_values(${compileExpression(state, expression)})`;
	} else if (isMapType(expType)) {
		state.usesTSLibrary = true;
		return `TS.map_entries(${compileExpression(state, expression)})`;
	} else if (isArrayType(expType)) {
		return compileExpression(state, expression);
	} else if (isStringType(expType)) {
		return `string.split(${compileExpression(state, expression)}, "")`;
	} else if (isIterableIterator(expType, expression)) {
		state.usesTSLibrary = true;
		return `TS.iterableCache(${compileExpression(state, expression)})`;
	}
}

export function compileSpreadExpressionOrThrow(state: CompilerState, expression: ts.Expression) {
	const result = compileSpreadExpression(state, expression);
	if (result) {
		return result;
	} else {
		throw new CompilerError(
			`Unable to spread expression of type ${expression.getType().getText()}`,
			expression,
			CompilerErrorType.BadSpreadType,
		);
	}
}

export function compileSpreadElement(state: CompilerState, node: ts.SpreadElement) {
	const expression = node.getExpression();
	checkNonAny(expression, true);

	if (ts.TypeGuards.isCallExpression(expression) && isTupleReturnTypeCall(expression)) {
		return compileCallExpression(state, expression, true);
	} else {
		return `unpack(${compileSpreadExpressionOrThrow(state, expression)})`;
	}
}

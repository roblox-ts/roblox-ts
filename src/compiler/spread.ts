import * as ts from "ts-morph";
import { checkNonAny, compileCallExpression, compileExpression } from ".";
import { CompilerState, PrecedingStatementContext } from "../CompilerState";
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

// TODO: Add logic equivalent to compileList.
export function compileSpreadableList(state: CompilerState, elements: Array<ts.Expression>) {
	let isInArray = false;
	const parts = new Array<Array<string> | string>();
	const contexts = new Array<Array<PrecedingStatementContext> | PrecedingStatementContext>();

	for (const element of elements) {
		if (ts.TypeGuards.isSpreadElement(element)) {
			state.enterPrecedingStatementContext();
			parts.push(compileSpreadExpressionOrThrow(state, element.getExpression()));
			contexts.push(state.exitPrecedingStatementContext());
			isInArray = false;
		} else {
			let last: Array<string>;
			let lastContext: Array<PrecedingStatementContext>;
			if (isInArray) {
				last = parts[parts.length - 1] as Array<string>;
				lastContext = contexts[contexts.length - 1] as Array<PrecedingStatementContext>;
			} else {
				last = new Array<string>();
				lastContext = new Array<PrecedingStatementContext>();
				parts.push(last);
				contexts.push(lastContext);
			}
			state.enterPrecedingStatementContext();
			last.push(compileExpression(state, element));
			lastContext.push(state.exitPrecedingStatementContext());
			isInArray = true;
		}
	}

	state.usesTSLibrary = true;

	const params = parts
		.map(v => {
			if (typeof v === "string") {
				return v;
			} else {
				return `{ ${v.join(", ")} }`;
			}
		})
		.join(", ");

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

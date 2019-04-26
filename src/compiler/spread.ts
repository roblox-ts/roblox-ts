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

export function compileArrayForSpread(state: CompilerState, expression: ts.Expression) {
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
		return `TS.iterable_cache(${compileExpression(state, expression)})`;
	} else {
		throw new CompilerError(
			`Unable to spread expression of type ${expType.getText()}`,
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
		return `unpack(${compileArrayForSpread(state, expression)})`;
	}
}

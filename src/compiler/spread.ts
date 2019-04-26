import * as ts from "ts-morph";
import { checkNonAny, transpileCallExpression, transpileExpression } from ".";
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

export function transpileArrayForSpread(state: CompilerState, expression: ts.Expression) {
	const expType = expression.getType();
	if (isSetType(expType)) {
		state.usesTSLibrary = true;
		return `TS.set_values(${transpileExpression(state, expression)})`;
	} else if (isMapType(expType)) {
		state.usesTSLibrary = true;
		return `TS.map_entries(${transpileExpression(state, expression)})`;
	} else if (isArrayType(expType)) {
		return transpileExpression(state, expression);
	} else if (isStringType(expType)) {
		return `string.split(${transpileExpression(state, expression)}, "")`;
	} else if (isIterableIterator(expType, expression)) {
		state.usesTSLibrary = true;
		return `TS.iterable_cache(${transpileExpression(state, expression)})`;
	} else {
		throw new CompilerError(
			`Unable to spread expression of type ${expType.getText()}`,
			expression,
			CompilerErrorType.BadSpreadType,
		);
	}
}

export function transpileSpreadElement(state: CompilerState, node: ts.SpreadElement) {
	const expression = node.getExpression();
	checkNonAny(expression, true);

	if (ts.TypeGuards.isCallExpression(expression) && isTupleReturnTypeCall(expression)) {
		return transpileCallExpression(state, expression, true);
	} else {
		return `unpack(${transpileArrayForSpread(state, expression)})`;
	}
}

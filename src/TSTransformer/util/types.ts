import ts from "byots";
import * as tsst from "ts-simple-type";
import { SYMBOL_NAMES, TransformState } from "TSTransformer";

function typeConstraint(type: ts.Type, callback: (type: ts.Type) => boolean): boolean {
	if (type.isUnion()) {
		return type.types.every(t => typeConstraint(t, callback));
	} else if (type.isIntersection()) {
		return type.types.some(t => typeConstraint(t, callback));
	} else {
		return callback(type);
	}
}

export function isSomeType(type: ts.Type, cb: (type: ts.Type) => boolean) {
	if (typeConstraint(type, cb)) {
		return true;
	} else {
		const constraint = type.getConstraint();
		if (constraint && typeConstraint(constraint, cb)) {
			return true;
		}
	}
	return false;
}

export function isAnyType(type: ts.Type) {
	return isSomeType(type, t => !!(t.flags & ts.TypeFlags.Any));
}

export function isArrayType(state: TransformState, type: ts.Type) {
	return isSomeType(
		type,
		t =>
			state.typeChecker.isTupleType(t) ||
			state.typeChecker.isArrayLikeType(t) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyArray) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Array) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadVoxelsArray) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.TemplateStringsArray),
	);
}

export function isSetType(state: TransformState, type: ts.Type) {
	return isSomeType(
		type,
		t =>
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlySet) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Set),
	);
}

export function isMapType(state: TransformState, type: ts.Type) {
	return isSomeType(
		type,
		t =>
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.ReadonlyMap) ||
			t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.Map),
	);
}

export function isLuaTupleType(state: TransformState, type: ts.Type) {
	return type.aliasSymbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.LuaTuple);
}

export function isSpreadableType(state: TransformState, type: ts.Type) {
	return isLuaTupleType(state, type) || isArrayType(state, type);
}

export function isNumberType(type: ts.Type) {
	return isSomeType(
		type,
		t =>
			!!(t.flags & ts.TypeFlags.Number) ||
			!!(t.flags & ts.TypeFlags.NumberLike) ||
			!!(t.flags & ts.TypeFlags.NumberLiteral),
	);
}

export function isStringType(type: ts.Type) {
	return isSomeType(
		type,
		t =>
			!!(t.flags & ts.TypeFlags.String) ||
			!!(t.flags & ts.TypeFlags.StringLike) ||
			!!(t.flags & ts.TypeFlags.StringLiteral),
	);
}

export function isGeneratorType(state: TransformState, type: ts.Type) {
	return isSomeType(type, t => t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.IterableIterator));
}

export function isIterableFunctionType(state: TransformState, type: ts.Type) {
	return isSomeType(type, t => t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.IterableFunction));
}

export function isFirstDecrementedIterableFunctionType(state: TransformState, type: ts.Type) {
	return isSomeType(
		type,
		t => t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.FirstDecrementedIterableFunction),
	);
}

export function isDoubleDecrementedIterableFunctionType(state: TransformState, type: ts.Type) {
	return isSomeType(
		type,
		t => t.symbol === state.macroManager.getSymbolOrThrow(SYMBOL_NAMES.DoubleDecrementedIterableFunction),
	);
}

export function isObjectType(type: ts.Type) {
	return isSomeType(type, t => !!(t.flags & ts.TypeFlags.Object));
}

export function getTypeArguments(state: TransformState, type: ts.Type) {
	return state.typeChecker.getTypeArguments(type as ts.TypeReference) ?? [];
}

/**
 * Uses ts-simple-type to check if a type is assignable to `false` or `undefined`
 */
export function canTypeBeLuaFalsy(state: TransformState, type: ts.Type) {
	const simpleType = state.getSimpleType(type);
	const isAssignableToFalse = tsst.isAssignableToValue(simpleType, false);
	const isAssignableToUndefined = tsst.isAssignableToSimpleTypeKind(simpleType, tsst.SimpleTypeKind.UNDEFINED);
	return isAssignableToFalse || isAssignableToUndefined;
}

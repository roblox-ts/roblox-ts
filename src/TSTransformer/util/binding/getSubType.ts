import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import {
	getTypeArguments,
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isLuaTupleType,
	isMapType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";
import ts from "typescript";

export function getSubType(
	state: TransformState,
	type: ts.Type | ReadonlyArray<ts.Type>,
	index: string | number,
): ts.Type | ReadonlyArray<ts.Type> {
	if (!ts.isArray(type)) {
		if (typeof index === "string") {
			const prop = type.getProperty(index);
			assert(prop && prop.valueDeclaration);
			return state.getType(prop.valueDeclaration);
		} else if (isLuaTupleType(state)(type)) {
			assert(type.aliasTypeArguments);
			return getSubType(state, type.aliasTypeArguments[0], index);
		} else if (isDefinitelyType(type, isArrayType(state))) {
			if (state.typeChecker.isTupleType(type)) {
				return getSubType(state, getTypeArguments(state, type), index);
			} else {
				const numIndexType = type.getNumberIndexType();
				assert(numIndexType);
				return numIndexType;
			}
		} else if (isDefinitelyType(type, t => isStringType(t))) {
			// T -> T
			return type;
		} else if (isDefinitelyType(type, isSetType(state))) {
			// Set<T> -> T
			return getTypeArguments(state, type)[0];
		} else if (isDefinitelyType(type, isMapType(state))) {
			// Map<K, V> -> [K, V]
			return getTypeArguments(state, type);
		} else if (isDefinitelyType(type, isGeneratorType(state))) {
			// Generator<T> -> T
			return getTypeArguments(state, type)[0];
		}
	} else if (typeof index === "number") {
		return type[index];
	}
	assert(false);
}

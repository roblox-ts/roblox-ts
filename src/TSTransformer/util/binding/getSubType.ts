import ts from "byots";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import {
	getTypeArguments,
	isArrayType,
	isGeneratorType,
	isLuaTupleType,
	isMapType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";

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
		} else if (isLuaTupleType(state, type)) {
			assert(type.aliasTypeArguments);
			return getSubType(state, type.aliasTypeArguments[0], index);
		} else if (isArrayType(state, type)) {
			if (state.typeChecker.isTupleType(type)) {
				return getTypeArguments(state, type)[0];
			} else {
				const numIndexType = type.getNumberIndexType();
				assert(numIndexType);
				return numIndexType;
			}
		} else if (isStringType(type)) {
			// T -> T
			return type;
		} else if (isSetType(state, type)) {
			// Set<T> -> T
			return getTypeArguments(state, type)[0];
		} else if (isMapType(state, type)) {
			// Map<K, V> -> [K, V]
			return getTypeArguments(state, type);
		} else if (isGeneratorType(state, type)) {
			// Generator<T> -> T
			return getTypeArguments(state, type)[0];
		}
	} else if (typeof index === "number") {
		return type[index];
	}
	assert(false);
}

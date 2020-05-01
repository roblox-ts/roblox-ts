import ts from "byots";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import {
	isArrayType,
	isTupleType,
	isSetType,
	isStringType,
	isMapType,
	isGeneratorType,
} from "TSTransformer/util/types";

export function getSubType(
	state: TransformState,
	type: ts.Type | Array<ts.Type>,
	index: string | number,
): ts.Type | Array<ts.Type> {
	if (!Array.isArray(type)) {
		if (typeof index === "string") {
			const prop = type.getProperty(index);
			assert(prop && prop.valueDeclaration);
			return state.getType(prop.valueDeclaration);
		} else if (isTupleType(state, type)) {
			assert(type.aliasTypeArguments);
			return getSubType(state, type.aliasTypeArguments[0], index);
		} else if (isArrayType(state, type)) {
			if (state.typeChecker.isTupleType(type)) {
				assert(type.typeArguments);
				return type.typeArguments[0];
			} else {
				const numIndexType = type.getNumberIndexType();
				assert(numIndexType);
				return numIndexType;
			}
		} else if (isStringType(state, type)) {
			// T -> T
			return type;
		} else if (isSetType(state, type)) {
			// Set<T> -> T
			assert(type.typeArguments);
			return type.typeArguments[0];
		} else if (isMapType(state, type)) {
			// Map<K, V> -> [K, V]
			assert(type.typeArguments);
			return type.typeArguments;
		} else if (isGeneratorType(state, type)) {
			// IterableIterator<T> -> T
			assert(type.typeArguments);
			return type.typeArguments[0];
		}
	} else if (typeof index === "number") {
		return type[index];
	}
	assert(false);
}

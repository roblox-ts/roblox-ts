import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { spreadDestructureArray } from "TSTransformer/util/spreadDestructuring/spreadDestructureArray";
import { spreadDestructureGenerator } from "TSTransformer/util/spreadDestructuring/spreadDestructureGenerator";
import { spreadDestructureMap } from "TSTransformer/util/spreadDestructuring/spreadDestructureMap";
import { spreadDestructureSet } from "TSTransformer/util/spreadDestructuring/spreadDestructureSet";
import { spreadDestructureString } from "./spreadDestructureString";
import { isArrayType, isDefinitelyType, isGeneratorType, isMapType, isSetType, isStringType } from "TSTransformer/util/types";
import ts from "typescript";

export * from "TSTransformer/util/spreadDestructuring/spreadDestructureArray";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructureMap";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructureObject";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructureSet";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructureString";

type SpreadDestructor = (
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
) => luau.Expression;

export function getSpreadDestructorForType(state: TransformState, node: ts.Node, type: ts.Type): SpreadDestructor {
	if (isDefinitelyType(type, isArrayType(state))) {
		return spreadDestructureArray;
	} else if (isDefinitelyType(type, isSetType(state))) {
		return spreadDestructureSet;
	} else if (isDefinitelyType(type, isMapType(state))) {
		return spreadDestructureMap;
	} else if (isDefinitelyType(type, isGeneratorType(state))) {
		return spreadDestructureGenerator;
	} else if (isDefinitelyType(type, isStringType)) {
		return spreadDestructureString;
	}

	return () => {
		assert(false, "Spread Destructuring not supported for type: " + state.typeChecker.typeToString(type));
	};
}

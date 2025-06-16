import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer/classes/TransformState";
import { spreadDestructArray } from "TSTransformer/util/spreadDestructuring/spreadDestructArray";
import { spreadDestructGenerator } from "TSTransformer/util/spreadDestructuring/spreadDestructGenerator";
import { spreadDestructMap } from "TSTransformer/util/spreadDestructuring/spreadDestructMap";
import { spreadDestructSet } from "TSTransformer/util/spreadDestructuring/spreadDestructSet";
import { isArrayType, isDefinitelyType, isGeneratorType, isMapType, isSetType } from "TSTransformer/util/types";
import ts from "typescript";

export * from "TSTransformer/util/spreadDestructuring/spreadDestructArray";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructMap";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructObject";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructSet";

type SpreadDestructor = (
	state: TransformState,
	parentId: luau.AnyIdentifier,
	index: number,
	idStack: Array<luau.AnyIdentifier>,
) => luau.Expression;

export function getSpreadDestructorForType(state: TransformState, node: ts.Node, type: ts.Type): SpreadDestructor {
	if (isDefinitelyType(type, isArrayType(state))) {
		return spreadDestructArray;
	} else if (isDefinitelyType(type, isSetType(state))) {
		return spreadDestructSet;
	} else if (isDefinitelyType(type, isMapType(state))) {
		return spreadDestructMap;
	} else if (isDefinitelyType(type, isGeneratorType(state))) {
		return spreadDestructGenerator;
	}

	return () => {
		assert(false, "Spread Destructuring not supported for type: " + state.typeChecker.typeToString(type));
	};
}

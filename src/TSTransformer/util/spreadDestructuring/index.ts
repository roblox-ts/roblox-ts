import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { TransformState } from "TSTransformer/classes/TransformState";
import { getAddIterableToArrayBuilder } from "TSTransformer/util/getAddIterableToArrayBuilder";
import { spreadDestructureArray } from "TSTransformer/util/spreadDestructuring/spreadDestructureArray";
import { spreadDestructureGenerator } from "TSTransformer/util/spreadDestructuring/spreadDestructureGenerator";
import { spreadDestructureMap } from "TSTransformer/util/spreadDestructuring/spreadDestructureMap";
import { spreadDestructureSet } from "TSTransformer/util/spreadDestructuring/spreadDestructureSet";
import { spreadDestructureString } from "TSTransformer/util/spreadDestructuring/spreadDestructureString";
import {
	isArrayType,
	isDefinitelyType,
	isGeneratorType,
	isIterableFunctionType,
	isIterableType,
	isMapType,
	isSetType,
	isStringType,
} from "TSTransformer/util/types";
import ts from "typescript";

export * from "TSTransformer/util/spreadDestructuring/spreadDestructureArray";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructureMap";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructureObject";
export * from "TSTransformer/util/spreadDestructuring/spreadDestructureSet";

type SpreadDestructor = (
	prereqs: Prereqs,
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

	return (prereqs, parentId) => {
		if (!isDefinitelyType(type, isIterableFunctionType(state))) {
			DiagnosticService.addDiagnostic(
				isDefinitelyType(type, isIterableType(state))
					? errors.noIterableIteration(node)
					: errors.noUnsupportedIteration(node),
			);
			return luau.none();
		}

		// iterator functions retain the position advanced by preceding bindings
		const restId = prereqs.pushToVar(luau.array(), "rest");
		const lengthId = prereqs.pushToVar(luau.number(0), "length");
		const addIterable = getAddIterableToArrayBuilder(state, node, type);
		prereqs.pushList(addIterable(prereqs, parentId, restId, lengthId, 0, false));
		return restId;
	};
}

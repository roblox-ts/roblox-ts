import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { TransformState } from "TSTransformer/classes/TransformState";
import { spreadDestructArray } from "TSTransformer/util/spreadDestruction/spreadDestructArray";
import { spreadDestructGenerator } from "TSTransformer/util/spreadDestruction/spreadDestructGenerator";
import { spreadDestructMap } from "TSTransformer/util/spreadDestruction/spreadDestructMap";
import { spreadDestructSet } from "TSTransformer/util/spreadDestruction/spreadDestructSet";
import { isArrayType, isDefinitelyType, isGeneratorType, isMapType, isSetType } from "TSTransformer/util/types";
import ts from "typescript";

export * from "TSTransformer/util/spreadDestruction/spreadDestructArray";
export * from "TSTransformer/util/spreadDestruction/spreadDestructMap";
export * from "TSTransformer/util/spreadDestruction/spreadDestructObject";
export * from "TSTransformer/util/spreadDestruction/spreadDestructSet";

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
		DiagnosticService.addDiagnostic(errors.unsupportedSpreadDestructing(node));
		return luau.none();
	};
}

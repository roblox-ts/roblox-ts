import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer/classes/TransformState";
import { transformInterpolatedStringPart } from "TSTransformer/nodes/transformInterpolatedStringPart";
import ts from "typescript";

// backtick string literals without interpolation expressions should be preserved
// as they still are valid in luau
export function transformNoSubstitutionTemplateLiteral(state: TransformState, node: ts.NoSubstitutionTemplateLiteral) {
	return luau.create(luau.SyntaxKind.InterpolatedString, {
		parts: luau.list.make(transformInterpolatedStringPart(node)),
	});
}

import luau from "@roblox-ts/luau-ast";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";
import ts from "typescript";

export function transformInterpolatedStringPart(node: ts.TemplateLiteralToken | ts.StringLiteral) {
	return luau.create(luau.SyntaxKind.InterpolatedStringPart, { text: createStringFromLiteral(node) });
}

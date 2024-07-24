import luau from "@roblox-ts/luau-ast";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";
import ts from "typescript";

export function transformStringLiteral(node: ts.StringLiteral) {
	return luau.string(createStringFromLiteral(node));
}

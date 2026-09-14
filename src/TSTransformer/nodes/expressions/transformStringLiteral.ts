import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { createStringFromLiteral } from "TSTransformer/util/createStringFromLiteral";
import ts from "typescript";

export function transformStringLiteral(state: TransformState, node: ts.StringLiteral) {
	const quote = node.getText()[0] === "'" ? "'" : '"';
	return luau.string(createStringFromLiteral(node), quote);
}

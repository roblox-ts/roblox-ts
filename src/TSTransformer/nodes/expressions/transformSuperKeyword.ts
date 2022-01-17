import luau from "@roblox-ts/luau-ast";

export function transformSuperKeyword() {
	return luau.globals.super;
}

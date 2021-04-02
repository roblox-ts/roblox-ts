const LUAU_METAMETHODS = new Set([
	"__index",
	"__newindex",
	"__call",
	"__concat",
	"__unm",
	"__add",
	"__sub",
	"__mul",
	"__div",
	"__mod",
	"__pow",
	"__tostring",
	"__metatable",
	"__eq",
	"__lt",
	"__le",
	"__mode",
	"__gc",
	"__len",
]);

/** Returns true if the given string is a valid Luau metamethod */
export function isMetamethod(id: string) {
	return LUAU_METAMETHODS.has(id);
}

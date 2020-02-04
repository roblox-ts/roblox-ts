import * as lua from "LuaAST";

let id = 0;

/** temporary hack */
export function getNewId() {
	return lua.id(`_${id++}`);
}

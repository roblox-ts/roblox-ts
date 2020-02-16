import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";

export interface NodeWithType<T extends lua.Node> {
	node: T;
	type: tsst.SimpleType;
}

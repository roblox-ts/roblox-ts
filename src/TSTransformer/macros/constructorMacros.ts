import * as lua from "LuaAST";
import { Macro } from "TSTransformer/macros/types";
import ts from "typescript";

export type ConstructorMacro = Macro<ts.NewExpression, lua.Expression>;
export type ConstructorMacroList = { [methodName: string]: ConstructorMacro };

export const CONSTRUCTOR_MACROS: ConstructorMacroList = {
	ArrayConstructor: (state, node) => {
		return lua.array();
	},
	SetConstructor: (state, node) => {
		return lua.set();
	},
	MapConstructor: (state, node) => {
		return lua.map();
	},
};

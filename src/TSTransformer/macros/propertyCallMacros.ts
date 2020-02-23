import ts from "typescript";
import * as lua from "LuaAST";
import { Macro } from "TSTransformer/macros/types";

type PropertyCallMacro = Macro<ts.CallExpression, lua.Expression>;

export const PROPERTY_CALL_MACROS = new Map<string, Map<string, PropertyCallMacro>>([
	[
		"Array",
		new Map([
			[
				"pop",
				() => {
					return lua.tempId();
				},
			],
		]),
	],
]);

import * as lua from "LuaAST";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

const PRIMITIVE_LUA_TYPES = new Set(["nil", "boolean", "string", "number", "table", "userdata", "function", "thread"]);

export const CALL_MACROS: MacroList<CallMacro> = {
	typeOf: (state, node) => {
		return lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.typeof,
			args: lua.list.make(...ensureTransformOrder(state, node.arguments)),
		});
	},

	typeIs: (state, node) => {
		const [value, typeStr] = ensureTransformOrder(state, node.arguments);
		const typeFunc = lua.isStringLiteral(typeStr) && PRIMITIVE_LUA_TYPES.has(typeStr.value) ? "type" : "typeof";
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.id(typeFunc),
				args: lua.list.make(value),
			}),
			operator: "==",
			right: typeStr,
		});
	},

	classIs: (state, node) => {
		const [value, typeStr] = ensureTransformOrder(state, node.arguments);
		return lua.create(lua.SyntaxKind.BinaryExpression, {
			left: lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: convertToIndexableExpression(value),
				name: "ClassName",
			}),
			operator: "==",
			right: typeStr,
		});
	},
};

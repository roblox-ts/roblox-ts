import * as lua from "LuaAST";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

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
		const left = lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.id(typeFunc),
			args: lua.list.make(value),
		});
		return lua.binary(left, "==", typeStr);
	},

	classIs: (state, node) => {
		const [value, typeStr] = ensureTransformOrder(state, node.arguments);
		const left = lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: convertToIndexableExpression(value),
			name: "ClassName",
		});
		return lua.binary(left, "==", typeStr);
	},

	opcall: (state, node) => {
		const successId = lua.tempId();
		const valueOrErrorId = lua.tempId();
		state.prereq(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: lua.list.make(successId, valueOrErrorId),
				right: lua.create(lua.SyntaxKind.CallExpression, {
					expression: lua.globals.pcall,
					args: lua.list.make(...ensureTransformOrder(state, node.arguments)),
				}),
			}),
		);

		const successExp = lua.map([
			[lua.strings.success, lua.bool(true)],
			[lua.strings.value, valueOrErrorId],
		]);

		const failureExp = lua.map([
			[lua.strings.success, lua.bool(false)],
			[lua.strings.error, valueOrErrorId],
		]);

		return lua.binary(successId, "and", lua.binary(successExp, "or", failureExp));
	},
};

import luau from "LuauAST";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

const PRIMITIVE_LUAU_TYPES = new Set(["nil", "boolean", "string", "number", "table", "userdata", "function", "thread"]);

export const CALL_MACROS: MacroList<CallMacro> = {
	typeOf: (state, node, expression, args) => {
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.typeof,
			args: luau.list.make(...args),
		});
	},

	typeIs: (state, node, expression, args) => {
		const [value, typeStr] = args;
		const typeFunc = luau.isStringLiteral(typeStr) && PRIMITIVE_LUAU_TYPES.has(typeStr.value) ? "type" : "typeof";
		const left = luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.id(typeFunc),
			args: luau.list.make(value),
		});
		return luau.binary(left, "==", typeStr);
	},

	classIs: (state, node, expression, args) => {
		const [value, typeStr] = args;
		const left = luau.create(luau.SyntaxKind.PropertyAccessExpression, {
			expression: convertToIndexableExpression(value),
			name: "ClassName",
		});
		return luau.binary(left, "==", typeStr);
	},

	opcall: (state, node, expression, args) => {
		const successId = luau.tempId();
		const valueOrErrorId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.list.make(successId, valueOrErrorId),
				right: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.pcall,
					args: luau.list.make(...args),
				}),
			}),
		);

		const successExp = luau.map([
			[luau.strings.success, luau.bool(true)],
			[luau.strings.value, valueOrErrorId],
		]);

		const failureExp = luau.map([
			[luau.strings.success, luau.bool(false)],
			[luau.strings.error, valueOrErrorId],
		]);

		return luau.binary(luau.binary(successId, "and", successExp), "or", failureExp);
	},

	identity: (state, node, expression, args) => args[0],
};

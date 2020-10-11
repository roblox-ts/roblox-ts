import luau from "LuauAST";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";

const PRIMITIVE_LUAU_TYPES = new Set(["nil", "boolean", "string", "number", "table", "userdata", "function", "thread"]);

export const CALL_MACROS: MacroList<CallMacro> = {
	typeOf: (state, node, expression, args) => luau.call(luau.globals.typeof, args),

	typeIs: (state, node, expression, args) => {
		const [value, typeStr] = args;
		const typeFunc =
			luau.isStringLiteral(typeStr) && PRIMITIVE_LUAU_TYPES.has(typeStr.value)
				? luau.globals.type
				: luau.globals.typeof;
		return luau.binary(luau.call(typeFunc, [value]), "==", typeStr);
	},

	classIs: (state, node, expression, args) => {
		const [value, typeStr] = args;
		return luau.binary(luau.property(convertToIndexableExpression(value), "ClassName"), "==", typeStr);
	},

	opcall: (state, node, expression, args) => {
		const successId = luau.tempId();
		const valueOrErrorId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.list.make(successId, valueOrErrorId),
				right: luau.call(luau.globals.pcall, args),
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

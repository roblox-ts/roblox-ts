import luau from "LuauAST";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { ensureTransformOrder } from "TSTransformer/util/ensureTransformOrder";

const PRIMITIVE_LUAU_TYPES = new Set(["nil", "boolean", "string", "number", "table", "userdata", "function", "thread"]);

export const CALL_MACROS: MacroList<CallMacro> = {
	typeOf: (state, node) => {
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.globals.typeof,
			args: luau.list.make(...ensureTransformOrder(state, node.arguments)),
		});
	},

	typeIs: (state, node) => {
		const [value, typeStr] = ensureTransformOrder(state, node.arguments);
		const typeFunc = luau.isStringLiteral(typeStr) && PRIMITIVE_LUAU_TYPES.has(typeStr.value) ? "type" : "typeof";
		const left = luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.id(typeFunc),
			args: luau.list.make(value),
		});
		return luau.binary(left, "==", typeStr);
	},

	classIs: (state, node) => {
		const [value, typeStr] = ensureTransformOrder(state, node.arguments);
		const left = luau.create(luau.SyntaxKind.PropertyAccessExpression, {
			expression: convertToIndexableExpression(value),
			name: "ClassName",
		});
		return luau.binary(left, "==", typeStr);
	},

	opcall: (state, node) => {
		const successId = luau.tempId();
		const valueOrErrorId = luau.tempId();
		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.list.make(successId, valueOrErrorId),
				right: luau.create(luau.SyntaxKind.CallExpression, {
					expression: luau.globals.pcall,
					args: luau.list.make(...ensureTransformOrder(state, node.arguments)),
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
};

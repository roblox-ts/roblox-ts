import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";

const PRIMITIVE_LUAU_TYPES = new Set([
	"nil",
	"boolean",
	"string",
	"number",
	"table",
	"userdata",
	"function",
	"thread",
	"vector",
]);

export const CALL_MACROS: MacroList<CallMacro> = {
	assert: (state, node, expression, args) => {
		args[0] = createTruthinessChecks(state, args[0], node.arguments[0]);
		return luau.call(luau.globals.assert, args);
	},

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

	identity: (state, node, expression, args) => args[0],

	$tuple: (state, node) => {
		DiagnosticService.addDiagnostic(errors.noTupleMacroOutsideReturn(node));
		return luau.none();
	},
};

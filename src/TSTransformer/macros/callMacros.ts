import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, MacroList } from "TSTransformer/macros/types";
import { convertToIndexableExpression } from "TSTransformer/util/convertToIndexableExpression";
import { getImportParts } from "TSTransformer/util/createImportExpression";
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
	"buffer",
]);

export const CALL_MACROS: MacroList<CallMacro> = {
	assert: (state, prereqs, node, expression, args) => {
		args[0] = createTruthinessChecks(state, prereqs, args[0], node.arguments[0]);
		return luau.call(luau.globals.assert, args);
	},

	typeOf: (state, prereqs, node, expression, args) => luau.call(luau.globals.typeof, args),

	typeIs: (state, prereqs, node, expression, args) => {
		const [value, typeStr] = args;
		const typeFunc =
			luau.isStringLiteral(typeStr) && PRIMITIVE_LUAU_TYPES.has(typeStr.value)
				? luau.globals.type
				: luau.globals.typeof;
		return luau.binary(luau.call(typeFunc, [value]), "==", typeStr);
	},

	classIs: (state, prereqs, node, expression, args) => {
		const [value, typeStr] = args;
		return luau.binary(luau.property(convertToIndexableExpression(value), "ClassName"), "==", typeStr);
	},

	identity: (state, prereqs, node, expression, args) => args[0],

	$range: (state, prereqs, node) => {
		DiagnosticService.addDiagnostic(errors.noRangeMacroOutsideForOf(node.expression));
		return luau.none();
	},

	$tuple: (state, prereqs, node) => {
		DiagnosticService.addDiagnostic(errors.noTupleMacroOutsideReturn(node));
		return luau.none();
	},

	$getModuleTree: (state, prereqs, node) => {
		const parts = getImportParts(state, node.getSourceFile(), node.arguments[0]);
		// converts the flat array into { root, { "rest", "of", "path" } }
		return luau.array([parts.shift()!, luau.array(parts)]);
	},
};

import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { CallMacro, CallMacroEffect, CallMacroTransform, MacroList } from "TSTransformer/macros/types";
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

function defineCallMacro(effect: CallMacroEffect, transform: CallMacroTransform): CallMacro {
	return Object.assign(transform, { effect });
}

export const CALL_MACROS: MacroList<CallMacro> = {
	assert: defineCallMacro(CallMacroEffect.Throws, (state, node, expression, args) => {
		args[0] = createTruthinessChecks(state, args[0], node.arguments[0]);
		return luau.call(luau.globals.assert, args);
	}),

	typeOf: defineCallMacro(CallMacroEffect.Pure, (state, node, expression, args) =>
		luau.call(luau.globals.typeof, args),
	),

	typeIs: defineCallMacro(CallMacroEffect.Pure, (state, node, expression, args) => {
		const [value, typeStr] = args;
		const typeFunc =
			luau.isStringLiteral(typeStr) && PRIMITIVE_LUAU_TYPES.has(typeStr.value)
				? luau.globals.type
				: luau.globals.typeof;
		return luau.binary(luau.call(typeFunc, [value]), "==", typeStr);
	}),

	classIs: defineCallMacro(CallMacroEffect.Pure, (state, node, expression, args) => {
		const [value, typeStr] = args;
		return luau.binary(luau.property(convertToIndexableExpression(value), "ClassName"), "==", typeStr);
	}),

	identity: defineCallMacro(CallMacroEffect.Pure, (state, node, expression, args) => args[0]),

	$range: defineCallMacro(CallMacroEffect.Pure, (state, node) => {
		DiagnosticService.addDiagnostic(errors.noRangeMacroOutsideForOf(node.expression));
		return luau.none();
	}),

	$tuple: defineCallMacro(CallMacroEffect.Pure, (state, node) => {
		DiagnosticService.addDiagnostic(errors.noTupleMacroOutsideReturn(node));
		return luau.none();
	}),

	$getModuleTree: defineCallMacro(CallMacroEffect.Pure, (state, node) => {
		const parts = getImportParts(state, node.getSourceFile(), node.arguments[0]);
		// converts the flat array into { root, { "rest", "of", "path" } }
		return luau.array([parts.shift()!, luau.array(parts)]);
	}),
};

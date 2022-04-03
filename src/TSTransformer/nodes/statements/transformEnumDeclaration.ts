import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import ts from "typescript";

function hasMultipleDefinitions(symbol: ts.Symbol): boolean {
	let amtValueDefinitions = 0;
	for (const declaration of symbol.getDeclarations() ?? []) {
		if (
			ts.isEnumDeclaration(declaration) &&
			!ts.getSelectedSyntacticModifierFlags(declaration, ts.ModifierFlags.Const)
		) {
			amtValueDefinitions++;
			if (amtValueDefinitions > 1) {
				return true;
			}
		}
	}
	return false;
}

export function transformEnumDeclaration(state: TransformState, node: ts.EnumDeclaration) {
	if (
		!!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.Const) &&
		state.compilerOptions.preserveConstEnums !== true
	) {
		return luau.list.make<luau.Statement>();
	}

	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	if (symbol && hasMultipleDefinitions(symbol)) {
		DiagnosticService.addDiagnostic(errors.noEnumMerging(node));
		return luau.list.make<luau.Statement>();
	}

	validateIdentifier(state, node.name);

	const id = transformIdentifierDefined(state, node.name);

	const statements = state.capturePrereqs(() => {
		const inverseId = state.pushToVar(luau.map(), "inverse");
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: id,
				operator: "=",
				right: luau.call(luau.globals.setmetatable, [
					luau.map(),
					luau.map([[luau.strings.__index, inverseId]]),
				]),
			}),
		);

		for (const member of node.members) {
			// `member.name` is typed as `PropertyName`
			// but only identifiers and string literals are legal in enum properties
			assert(ts.isIdentifier(member.name) || ts.isStringLiteral(member.name));

			const nameStr = member.name.text;
			const value = state.typeChecker.getConstantValue(member);

			let valueExp: luau.Expression;
			if (typeof value === "string") {
				valueExp = luau.string(value);
			} else if (typeof value === "number") {
				valueExp = luau.number(value);
			} else {
				assert(member.initializer);
				valueExp = state.pushToVarIfComplex(transformExpression(state, member.initializer), "value");
			}

			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.property(id, nameStr),
					operator: "=",
					right: valueExp,
				}),
			);

			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: inverseId,
						index: valueExp,
					}),
					operator: "=",
					right: luau.string(nameStr),
				}),
			);
		}
	});

	const list = luau.list.make<luau.Statement>(luau.create(luau.SyntaxKind.DoStatement, { statements }));
	if (symbol && state.isHoisted.get(symbol) !== true) {
		luau.list.unshift(list, luau.create(luau.SyntaxKind.VariableDeclaration, { left: id, right: undefined }));
	}
	return list;
}

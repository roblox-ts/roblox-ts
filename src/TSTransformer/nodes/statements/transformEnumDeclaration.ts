import luau from "@roblox-ts/luau-ast";
import { Lazy } from "Shared/classes/Lazy";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformPropertyName } from "TSTransformer/nodes/transformPropertyName";
import { expressionMightMutate } from "TSTransformer/util/expressionMightMutate";
import { hasMultipleDefinitions } from "TSTransformer/util/hasMultipleDefinitions";
import { validateIdentifier } from "TSTransformer/util/validateIdentifier";
import ts from "typescript";

function needsInverseEntry(state: TransformState, member: ts.EnumMember) {
	const name =
		ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)
			? member.name.text
			: ts.isComputedPropertyName(member.name) && ts.isStringLiteral(member.name.expression)
			? member.name.expression.text
			: undefined;
	return state.typeChecker.getConstantValue(member) !== name;
}

export function transformEnumDeclaration(state: TransformState, node: ts.EnumDeclaration) {
	if (
		!!ts.getSelectedSyntacticModifierFlags(node, ts.ModifierFlags.Const) &&
		state.compilerOptions.preserveConstEnums !== true
	) {
		return luau.list.make<luau.Statement>();
	}

	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	if (
		symbol &&
		hasMultipleDefinitions(
			symbol,
			declaration =>
				ts.isEnumDeclaration(declaration) &&
				!ts.getSelectedSyntacticModifierFlags(declaration, ts.ModifierFlags.Const),
		)
	) {
		DiagnosticService.addDiagnosticWithCache(
			symbol,
			errors.noEnumMerging(node),
			state.multiTransformState.isReportedByMultipleDefinitionsCache,
		);
		return luau.list.make<luau.Statement>();
	}

	validateIdentifier(state, node.name);

	const id = transformIdentifierDefined(state, node.name);
	const inverseId = luau.tempId("inverse");
	const inverse = new Lazy(() => inverseId);

	const statements = state.capturePrereqs(() => {
		for (const member of node.members) {
			const name = transformPropertyName(state, member.name);
			const index = expressionMightMutate(
				state,
				name,
				ts.isComputedPropertyName(member.name) ? member.name.expression : member.name,
			)
				? // note: we don't use pushToVarIfComplex here
				  // because identifier also needs to be pushed
				  // since the value calculation might reassign the variable
				  state.pushToVar(name)
				: name;

			const value = state.typeChecker.getConstantValue(member);
			let valueExp: luau.Expression;
			if (typeof value === "string") {
				valueExp = luau.string(value);
			} else if (typeof value === "number") {
				valueExp = luau.number(value);
			} else {
				// constantValue is always number without initializer, so assert is safe
				assert(member.initializer);
				valueExp = state.pushToVarIfComplex(transformExpression(state, member.initializer), "value");
			}

			state.prereq(
				luau.create(luau.SyntaxKind.Assignment, {
					left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
						expression: id,
						index,
					}),
					operator: "=",
					right: valueExp,
				}),
			);

			if (needsInverseEntry(state, member)) {
				state.prereq(
					luau.create(luau.SyntaxKind.Assignment, {
						left: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
							expression: inverse.get(),
							index: valueExp,
						}),
						operator: "=",
						right: index,
					}),
				);
			}
		}
	});

	luau.list.unshift(
		statements,
		luau.create(luau.SyntaxKind.Assignment, {
			left: id,
			operator: "=",
			right: inverse.wasInitialized()
				? luau.call(luau.globals.setmetatable, [luau.map(), luau.map([[luau.strings.__index, inverseId]])])
				: luau.map(),
		}),
	);
	if (inverse.wasInitialized()) {
		luau.list.unshift(
			statements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: inverseId,
				right: luau.map(),
			}),
		);
	}

	const list = luau.list.make<luau.Statement>(luau.create(luau.SyntaxKind.DoStatement, { statements }));
	if (symbol && state.isHoisted.get(symbol) !== true) {
		luau.list.unshift(list, luau.create(luau.SyntaxKind.VariableDeclaration, { left: id, right: undefined }));
	}
	return list;
}

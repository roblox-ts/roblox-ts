import luau from "@roblox-ts/luau-ast";
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
	return typeof state.typeChecker.getConstantValue(member) !== "string";
}

export function transformEnumDeclaration(state: TransformState, node: ts.EnumDeclaration) {
	if (ts.hasSyntacticModifier(node, ts.ModifierFlags.Const) && state.compilerOptions.preserveConstEnums !== true) {
		return luau.list.make<luau.Statement>();
	}

	const symbol = state.typeChecker.getSymbolAtLocation(node.name);
	if (
		symbol &&
		hasMultipleDefinitions(
			symbol,
			declaration =>
				ts.isEnumDeclaration(declaration) && !ts.hasSyntacticModifier(declaration, ts.ModifierFlags.Const),
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

	const left = transformIdentifierDefined(state, node.name);
	const isHoisted = symbol !== undefined && state.isHoisted.get(symbol) === true;

	if (node.members.every(member => !needsInverseEntry(state, member))) {
		const right = luau.map(
			node.members.map(member => [
				state.pushToVarIfComplex(transformPropertyName(state, member.name)),
				luau.string(state.typeChecker.getConstantValue(member) as string),
			]),
		);
		return luau.list.make<luau.Statement>(
			isHoisted
				? luau.create(luau.SyntaxKind.Assignment, { left, operator: "=", right })
				: luau.create(luau.SyntaxKind.VariableDeclaration, { left, right }),
		);
	}

	const statements = state.capturePrereqs(() => {
		const inverseId = state.pushToVar(luau.map(), "inverse");
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left,
				operator: "=",
				right: luau.call(luau.globals.setmetatable, [
					luau.map(),
					luau.map([[luau.strings.__index, inverseId]]),
				]),
			}),
		);

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
						expression: left,
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
							expression: inverseId,
							index: valueExp,
						}),
						operator: "=",
						right: index,
					}),
				);
			}
		}
	});

	const list = luau.list.make<luau.Statement>(luau.create(luau.SyntaxKind.DoStatement, { statements }));
	if (!isHoisted) {
		luau.list.unshift(list, luau.create(luau.SyntaxKind.VariableDeclaration, { left, right: undefined }));
	}
	return list;
}

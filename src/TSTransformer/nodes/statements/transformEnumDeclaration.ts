import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
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

	validateIdentifier(node.name);

	const left = transformIdentifierDefined(state, node.name);
	const isHoisted = symbol !== undefined && state.isHoisted.get(symbol) === true;
	const statements = luau.list.make<luau.Statement>();

	if (node.members.every(member => !needsInverseEntry(state, member))) {
		const prereqs = new Prereqs();
		const right = luau.map(
			node.members.map(member => [
				prereqs.pushToVarIfComplex(transformPropertyName(state, prereqs, member.name)),
				luau.string(state.typeChecker.getConstantValue(member) as string),
			]),
		);
		luau.list.pushList(statements, prereqs.statements);
		luau.list.push(
			statements,
			isHoisted
				? luau.create(luau.SyntaxKind.Assignment, { left, operator: "=", right })
				: luau.create(luau.SyntaxKind.VariableDeclaration, { left, right }),
		);
		return statements;
	}

	const enumStatements = luau.list.make<luau.Statement>();
	const inverseId = luau.tempId("inverse");
	luau.list.push(
		enumStatements,
		luau.create(luau.SyntaxKind.VariableDeclaration, { left: inverseId, right: luau.map() }),
	);
	luau.list.push(
		enumStatements,
		luau.create(luau.SyntaxKind.Assignment, {
			left,
			operator: "=",
			right: luau.call(luau.globals.setmetatable, [luau.map(), luau.map([[luau.strings.__index, inverseId]])]),
		}),
	);

	for (const member of node.members) {
		const memberPrereqs = new Prereqs();
		const name = transformPropertyName(state, memberPrereqs, member.name);
		const index = expressionMightMutate(
			state,
			name,
			ts.isComputedPropertyName(member.name) ? member.name.expression : member.name,
		)
			? // note: we don't use pushToVarIfComplex here
				// because identifier also needs to be pushed
				// since the value calculation might reassign the variable
				memberPrereqs.pushToVar(name)
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
			valueExp = memberPrereqs.pushToVarIfComplex(
				transformExpression(state, memberPrereqs, member.initializer),
				"value",
			);
		}

		luau.list.pushList(enumStatements, memberPrereqs.statements);
		luau.list.push(
			enumStatements,
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
			luau.list.push(
				enumStatements,
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

	luau.list.push(statements, luau.create(luau.SyntaxKind.DoStatement, { statements: enumStatements }));
	if (!isHoisted) {
		luau.list.unshift(statements, luau.create(luau.SyntaxKind.VariableDeclaration, { left, right: undefined }));
	}
	return statements;
}

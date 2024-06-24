import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { assertNever } from "TSTransformer/util/assertNever";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { isDefinitelyType, isNumberType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformPostfixUnaryExpression(state: TransformState, node: ts.PostfixUnaryExpression) {
	validateNotAnyType(state, node.operand);

	const writable = transformWritableExpression(state, node.operand, true);
	const origValue = luau.tempId("original");

	state.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: origValue,
			right: writable,
		}),
	);

	state.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writable,
			operator:
				node.operator === ts.SyntaxKind.PlusPlusToken
					? "+="
					: node.operator === ts.SyntaxKind.MinusMinusToken
						? "-="
						: assertNever(node.operator, "transformPostfixUnaryExpression"),
			right: luau.number(1),
		}),
	);

	return origValue;
}

export function transformPrefixUnaryExpression(state: TransformState, node: ts.PrefixUnaryExpression) {
	validateNotAnyType(state, node.operand);

	if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
		const writable = transformWritableExpression(state, node.operand, true);
		const operator: luau.AssignmentOperator = node.operator === ts.SyntaxKind.PlusPlusToken ? "+=" : "-=";
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: writable,
				operator,
				right: luau.number(1),
			}),
		);
		return writable;
	} else if (node.operator === ts.SyntaxKind.PlusToken) {
		DiagnosticService.addDiagnostic(errors.noUnaryPlus(node));
		return transformExpression(state, node.operand);
	} else if (node.operator === ts.SyntaxKind.MinusToken) {
		if (!isDefinitelyType(state.getType(node.operand), isNumberType)) {
			DiagnosticService.addDiagnostic(errors.noNonNumberUnaryMinus(node));
		}
		return luau.unary("-", transformExpression(state, node.operand));
	} else if (node.operator === ts.SyntaxKind.ExclamationToken) {
		const checks = createTruthinessChecks(state, transformExpression(state, node.operand), node.operand);
		return luau.unary("not", checks);
	} else if (node.operator === ts.SyntaxKind.TildeToken) {
		return luau.call(luau.property(luau.globals.bit32, "bnot"), [transformExpression(state, node.operand)]);
	}
	return assertNever(node.operator, "transformPrefixUnaryExpression");
}

import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { assertNever } from "TSTransformer/util/assertNever";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { isDefinitelyType, isNumberType } from "TSTransformer/util/types";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";
import ts from "typescript";

export function transformPostfixUnaryExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.PostfixUnaryExpression,
) {
	validateNotAnyType(state, node.operand);

	const writable = transformWritableExpression(state, prereqs, node.operand, true);
	const origValue = luau.tempId("original");

	prereqs.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: origValue,
			right: writable,
		}),
	);

	prereqs.prereq(
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

export function transformPrefixUnaryExpression(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.PrefixUnaryExpression,
) {
	validateNotAnyType(state, node.operand);

	if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
		const writable = transformWritableExpression(state, prereqs, node.operand, true);
		const operator: luau.AssignmentOperator = node.operator === ts.SyntaxKind.PlusPlusToken ? "+=" : "-=";
		prereqs.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: writable,
				operator,
				right: luau.number(1),
			}),
		);
		return writable;
	} else if (node.operator === ts.SyntaxKind.PlusToken) {
		DiagnosticService.addDiagnostic(errors.noUnaryPlus(node));
		return transformExpression(state, prereqs, node.operand);
	} else if (node.operator === ts.SyntaxKind.MinusToken) {
		if (!isDefinitelyType(state.getType(node.operand), isNumberType)) {
			DiagnosticService.addDiagnostic(errors.noNonNumberUnaryMinus(node));
		}
		return luau.unary("-", transformExpression(state, prereqs, node.operand));
	} else if (node.operator === ts.SyntaxKind.ExclamationToken) {
		const checks = createTruthinessChecks(
			state,
			prereqs,
			transformExpression(state, prereqs, node.operand),
			node.operand,
		);
		return luau.unary("not", checks);
	} else if (node.operator === ts.SyntaxKind.TildeToken) {
		return luau.call(luau.property(luau.globals.bit32, "bnot"), [
			transformExpression(state, prereqs, node.operand),
		]);
	}
	return assertNever(node.operator, "transformPrefixUnaryExpression");
}

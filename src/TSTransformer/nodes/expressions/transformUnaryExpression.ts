import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getKindName } from "TSTransformer/util/getKindName";
import { isUsedAsStatement } from "TSTransformer/util/isUsedAsStatement";
import { isDefinitelyType, isNumberType } from "TSTransformer/util/types";
import ts from "typescript";

function checkUnaryType(state: TransformState, node: ts.PrefixUnaryExpression | ts.PostfixUnaryExpression): void {
	// We can omit passing `node` because `any` won't match `number`
	// The noNonNumberUnary error is more accurate than no-any
	if (!isDefinitelyType(state, state.getType(node.operand), undefined, isNumberType)) {
		DiagnosticService.addDiagnostic(errors.noNonNumberUnary(node));
	}
}

export function transformPostfixUnaryExpression(state: TransformState, node: ts.PostfixUnaryExpression) {
	// TS will allow both `any` and `number`
	checkUnaryType(state, node);

	const originalIsUsed = !isUsedAsStatement(node);

	const writable = transformWritableExpression(state, node.operand, originalIsUsed);
	const origValue = luau.tempId("original");
	if (originalIsUsed) {
		state.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: origValue,
				right: writable,
			}),
		);
	}

	state.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writable,
			operator:
				node.operator === ts.SyntaxKind.PlusPlusToken
					? "+="
					: node.operator === ts.SyntaxKind.MinusMinusToken
					? "-="
					: assert(false, "Unknown postfix unary operator"),
			right: luau.number(1),
		}),
	);

	return originalIsUsed ? origValue : luau.nil();
}

export function transformPrefixUnaryExpression(state: TransformState, node: ts.PrefixUnaryExpression) {
	// All operators except `!` need operand to be `number` type
	if (node.operator !== ts.SyntaxKind.ExclamationToken) checkUnaryType(state, node);

	if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
		const resultIsUsed = !isUsedAsStatement(node);
		const writable = transformWritableExpression(state, node.operand, resultIsUsed);
		state.prereq(
			luau.create(luau.SyntaxKind.Assignment, {
				left: writable,
				operator: node.operator === ts.SyntaxKind.PlusPlusToken ? "+=" : "-=",
				right: luau.number(1),
			}),
		);
		return resultIsUsed ? writable : luau.nil();
	} else if (node.operator === ts.SyntaxKind.PlusToken) {
		// in JS, `+x` is of type number, and NaN if not valid
		// in Lua, `tonumber(x)` is nil if not valid
		// so we can't emit that, and throw a diagnostic instead
		DiagnosticService.addDiagnostic(errors.noUnaryPlus(node));
		// We still transform, so we can report any further errors down the line
		return transformExpression(state, node.operand);
	} else if (node.operator === ts.SyntaxKind.MinusToken) {
		return luau.unary("-", transformExpression(state, node.operand));
	} else if (node.operator === ts.SyntaxKind.ExclamationToken) {
		const checks = createTruthinessChecks(state, transformExpression(state, node.operand), node.operand);
		return luau.unary("not", checks);
	} else if (node.operator === ts.SyntaxKind.TildeToken) {
		return luau.call(luau.property(luau.globals.bit32, "bnot"), [transformExpression(state, node.operand)]);
	}
	assert(false, `Unsupported PrefixUnaryExpression operator: ${getKindName(node.operator)}`);
}

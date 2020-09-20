import ts from "byots";
import luau from "LuauAST";
import { diagnostics } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getKindName } from "TSTransformer/util/getKindName";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformPostfixUnaryExpression(state: TransformState, node: ts.PostfixUnaryExpression) {
	validateNotAnyType(state, node.operand);

	const writable = transformWritableExpression(state, node.operand, true);
	const origValue = luau.tempId();

	state.prereq(
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: origValue,
			right: writable,
		}),
	);

	const operator: luau.AssignmentOperator = node.operator === ts.SyntaxKind.PlusPlusToken ? "+=" : "-=";

	state.prereq(
		luau.create(luau.SyntaxKind.Assignment, {
			left: writable,
			operator,
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
		state.addDiagnostic(diagnostics.noUnaryPlus(node));
		return transformExpression(state, node.operand);
	} else if (node.operator === ts.SyntaxKind.MinusToken) {
		return luau.unary("-", transformExpression(state, node.operand));
	} else if (node.operator === ts.SyntaxKind.ExclamationToken) {
		const checks = createTruthinessChecks(
			state,
			transformExpression(state, node.operand),
			state.getType(node.operand),
		);
		return luau.unary("not", checks);
	} else if (node.operator === ts.SyntaxKind.TildeToken) {
		return luau.create(luau.SyntaxKind.CallExpression, {
			expression: luau.create(luau.SyntaxKind.PropertyAccessExpression, {
				expression: luau.globals.bit32,
				name: "bnot",
			}),
			args: luau.list.make(transformExpression(state, node.operand)),
		});
	}
	assert(false, `Unsupported PrefixUnaryExpression operator: ${getKindName(node.operator)}`);
}

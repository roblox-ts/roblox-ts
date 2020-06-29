import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformWritableExpression } from "TSTransformer/nodes/transformWritable";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { validateNotAnyType } from "TSTransformer/util/validateNotAny";

export function transformPostfixUnaryExpression(state: TransformState, node: ts.PostfixUnaryExpression) {
	validateNotAnyType(state, node.operand);

	const writable = transformWritableExpression(state, node.operand, true);
	const origValue = lua.tempId();

	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: origValue,
			right: writable,
		}),
	);

	const operator: lua.AssignmentOperator = node.operator === ts.SyntaxKind.PlusPlusToken ? "+=" : "-=";

	state.prereq(
		lua.create(lua.SyntaxKind.Assignment, {
			left: writable,
			operator,
			right: lua.number(1),
		}),
	);

	return origValue;
}

export function transformPrefixUnaryExpression(state: TransformState, node: ts.PrefixUnaryExpression) {
	validateNotAnyType(state, node.operand);

	if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
		const writable = transformWritableExpression(state, node.operand, true);
		const operator: lua.AssignmentOperator = node.operator === ts.SyntaxKind.PlusPlusToken ? "+=" : "-=";
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: writable,
				operator,
				right: lua.number(1),
			}),
		);
		return writable;
	} else if (node.operator === ts.SyntaxKind.MinusToken) {
		return lua.unary("-", transformExpression(state, node.operand));
	} else if (node.operator === ts.SyntaxKind.ExclamationToken) {
		const checks = createTruthinessChecks(
			state,
			transformExpression(state, node.operand),
			state.getType(node.operand),
		);
		return lua.unary("not", checks);
	}
	assert(false, `Unsupported PrefixUnaryExpression operator: ${ts.SyntaxKind[node.operator]}`);
}

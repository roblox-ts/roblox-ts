import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import {
	transformWritableExpression,
	transformWritableExpressionWithType,
} from "TSTransformer/nodes/transformWritable";
import { createCompoundAssignmentExpression } from "TSTransformer/util/assignment";
import { createNodeWithType } from "TSTransformer/util/createNodeWithType";

export function transformPostfixUnaryExpression(state: TransformState, node: ts.PostfixUnaryExpression) {
	const writable = transformWritableExpression(state, node.operand);
	const origValue = lua.tempId();

	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: origValue,
			right: writable,
		}),
	);

	const readable = lua.isAnyIdentifier(writable) ? writable : origValue;
	const operator: lua.BinaryOperator = node.operator === ts.SyntaxKind.PlusPlusToken ? "+" : "-";

	state.prereq(
		lua.create(lua.SyntaxKind.Assignment, {
			left: writable,
			right: lua.create(lua.SyntaxKind.BinaryExpression, {
				left: readable,
				operator,
				right: lua.number(1),
			}),
		}),
	);

	return origValue;
}

export function transformPrefixUnaryExpression(state: TransformState, node: ts.PrefixUnaryExpression) {
	if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
		return createCompoundAssignmentExpression(
			state,
			transformWritableExpressionWithType(state, node.operand),
			node.operator,
			createNodeWithType(lua.number(1)),
		);
	} else if (node.operator === ts.SyntaxKind.MinusToken) {
		return lua.create(lua.SyntaxKind.UnaryExpression, {
			expression: transformExpression(state, node.operand),
			operator: "-",
		});
	} else if (node.operator === ts.SyntaxKind.ExclamationToken) {
		return lua.create(lua.SyntaxKind.UnaryExpression, {
			expression: transformExpression(state, node.operand),
			operator: "not",
		});
	}
	assert(false, `Unsupported PrefixUnaryExpression operator: ${ts.SyntaxKind[node.operator]}`);
}

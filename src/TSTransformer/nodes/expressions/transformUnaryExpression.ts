import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { getWritableExpression, LuaWritable } from "TSTransformer/util/getWritableExpression";
import { pushToVarIfNonId } from "TSTransformer/util/pushToVar";
import ts from "typescript";

export function getAssignmentStatement(
	writable: LuaWritable,
	operator: lua.BinaryOperator,
	value: lua.Expression,
	origValue?: lua.TemporaryIdentifier,
): lua.Assignment {
	return lua.create(lua.SyntaxKind.Assignment, {
		left: writable,
		right: lua.create(lua.SyntaxKind.BinaryExpression, {
			left: origValue !== undefined && !lua.isIdentifier(writable) ? origValue : writable,
			operator,
			right: value,
		}),
	});
}

export function transformPostfixUnaryExpression(state: TransformState, node: ts.PostfixUnaryExpression) {
	const writable = getWritableExpression(state, node.operand);
	const origValue = lua.tempId();

	state.prereq(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: origValue,
			right: writable,
		}),
	);

	const operator = node.operator === ts.SyntaxKind.PlusPlusToken ? lua.BinaryOperator.Plus : lua.BinaryOperator.Minus;

	state.prereq(getAssignmentStatement(writable, operator, lua.number(1), origValue));
	return origValue;
}

export function transformPrefixUnaryExpression(state: TransformState, node: ts.PrefixUnaryExpression) {
	if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
		const id = pushToVarIfNonId(state, transformExpression(state, node.operand));
		state.prereq(
			lua.create(lua.SyntaxKind.Assignment, {
				left: id,
				right: lua.create(lua.SyntaxKind.BinaryExpression, {
					left: id,
					operator:
						node.operator === ts.SyntaxKind.PlusPlusToken
							? lua.BinaryOperator.Plus
							: lua.BinaryOperator.Minus,
					right: lua.number(1),
				}),
			}),
		);
		return id;
	} else if (node.operator === ts.SyntaxKind.MinusToken) {
		return lua.create(lua.SyntaxKind.UnaryExpression, {
			expression: transformExpression(state, node.operand),
			operator: lua.UnaryOperator.Minus,
		});
	} else if (node.operator === ts.SyntaxKind.ExclamationToken) {
		return lua.create(lua.SyntaxKind.UnaryExpression, {
			expression: transformExpression(state, node.operand),
			operator: lua.UnaryOperator.Not,
		});
	} else {
		throw new Error(`Unsupported PrefixUnaryExpression operator: ${ts.SyntaxKind[node.operator]}`);
	}
}

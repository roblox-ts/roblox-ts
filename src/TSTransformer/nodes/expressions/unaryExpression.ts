import * as lua from "LuaAST";
import { transformExpression } from "TSTransformer/nodes/expressions/expression";
import { TransformState } from "TSTransformer/TransformState";
import ts from "typescript";

let id = 0;
function getNewId() {
	return lua.id(`_${id++}`);
}

function pushToVarIfNonId(state: TransformState, expression: lua.Expression) {
	if (lua.isIdentifier(expression)) {
		return expression;
	}
	const temp = getNewId();
	state.addPrereqStatement(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: temp,
			right: expression,
		}),
	);
	return temp;
}

export function transformPostfixUnaryExpression(state: TransformState, node: ts.PostfixUnaryExpression) {
	const id = pushToVarIfNonId(state, transformExpression(state, node.operand));
	const origValue = getNewId();

	state.addPrereqStatement(
		lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: origValue,
			right: id,
		}),
	);

	state.addPrereqStatement(
		lua.create(lua.SyntaxKind.Assignment, {
			left: id,
			right: lua.create(lua.SyntaxKind.BinaryExpression, {
				left: origValue,
				operator:
					node.operator === ts.SyntaxKind.PlusPlusToken ? lua.BinaryOperator.Plus : lua.BinaryOperator.Minus,
				right: lua.number(1),
			}),
		}),
	);

	return origValue;
}

export function transformPrefixUnaryExpression(state: TransformState, node: ts.PrefixUnaryExpression) {
	if (node.operator === ts.SyntaxKind.PlusPlusToken || node.operator === ts.SyntaxKind.MinusMinusToken) {
		const id = pushToVarIfNonId(state, transformExpression(state, node.operand));
		state.addPrereqStatement(
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

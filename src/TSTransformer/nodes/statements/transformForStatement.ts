import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformVariableDeclaration } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformWhileStatementInner } from "TSTransformer/nodes/statements/transformWhileStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { isNumberType } from "TSTransformer/util/types";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";

function getIncrementorValue(id: ts.Identifier, incrementor: ts.Expression) {
	if (ts.isUnaryExpressionWithWrite(incrementor) && incrementor.operand === id) {
		if (incrementor.operator === ts.SyntaxKind.PlusPlusToken) {
			return 1;
		} else if (incrementor.operator === ts.SyntaxKind.MinusMinusToken) {
			return -1;
		}
	} else if (
		ts.isBinaryExpression(incrementor) &&
		incrementor.left === id &&
		ts.isNumericLiteral(incrementor.right)
	) {
		if (incrementor.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) {
			return Number(incrementor.right.text);
		} else if (incrementor.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken) {
			return -Number(incrementor.right.text);
		}
	}
}

function getOptimizedForStatement(
	state: TransformState,
	initializer: ts.ForInitializer,
	condition: ts.Expression,
	incrementor: ts.Expression,
	statement: ts.Statement,
) {
	if (!ts.isVariableDeclarationList(initializer) || initializer.declarations.length !== 1) return undefined;

	const varDec = initializer.declarations[0];
	if (!varDec.initializer || !ts.isIdentifier(varDec.name) || !isNumberType(state, state.getType(varDec.initializer)))
		return undefined;

	if (!ts.isBinaryExpression(condition)) return undefined;

	const stepValue = getIncrementorValue(varDec.name, incrementor);
	if (!stepValue) return undefined;

	// const start = lua.number(startValue);
	// const end = lua.number(endValue);
	// if (condition.operatorToken.kind === ts.SyntaxKind.LessThanToken && ) {
	// }

	// const id = transformIdentifierDefined(state, varDec.name);
	// const step = stepValue === 1 ? undefined : lua.number(stepValue);
	// const statements = lua.list.make<lua.Statement>();

	// return lua.create(lua.SyntaxKind.NumericForStatement, { id, start, end, step, statements });
}

export function transformForStatement(state: TransformState, node: ts.ForStatement) {
	if (node.initializer && node.condition && node.incrementor) {
		const optimized = getOptimizedForStatement(
			state,
			node.initializer,
			node.condition,
			node.incrementor,
			node.statement,
		);
		if (optimized) {
			return lua.list.make(optimized);
		}
	}

	const statements = lua.list.make<lua.Statement>();

	const nodeInitializer = node.initializer;
	if (nodeInitializer) {
		if (ts.isVariableDeclarationList(nodeInitializer)) {
			for (const variableDeclaration of nodeInitializer.declarations) {
				lua.list.pushList(statements, transformVariableDeclaration(state, variableDeclaration));
			}
		} else {
			lua.list.pushList(statements, transformExpressionStatementInner(state, nodeInitializer));
		}
	}

	let whileStatement: lua.WhileStatement;
	if (node.condition) {
		whileStatement = transformWhileStatementInner(state, node.condition, node.statement);
	} else {
		const statements = transformStatementList(
			state,
			ts.isBlock(node.statement) ? node.statement.statements : [node.statement],
		);
		whileStatement = lua.create(lua.SyntaxKind.WhileStatement, {
			condition: lua.bool(true),
			statements,
		});
	}
	lua.list.push(statements, whileStatement);

	const nodeIncrementor = node.incrementor;
	if (nodeIncrementor) {
		lua.list.pushList(whileStatement.statements, transformExpressionStatementInner(state, nodeIncrementor));
	}

	if (statements.head === statements.tail) {
		return statements;
	} else {
		return lua.list.make<lua.Statement>(lua.create(lua.SyntaxKind.DoStatement, { statements }));
	}
}

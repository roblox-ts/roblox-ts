import ts from "byots";
import * as lua from "LuaAST";
import { TransformState } from "TSTransformer";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformVariableDeclaration } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformWhileStatementInner } from "TSTransformer/nodes/statements/transformWhileStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getStatements } from "TSTransformer/util/getStatements";
import { isNumberType } from "TSTransformer/util/types";

function getIncrementorValue(state: TransformState, symbol: ts.Symbol, incrementor: ts.Expression) {
	if (
		(ts.isPrefixUnaryExpression(incrementor) || ts.isPostfixUnaryExpression(incrementor)) &&
		state.typeChecker.getSymbolAtLocation(incrementor.operand) === symbol
	) {
		if (incrementor.operator === ts.SyntaxKind.PlusPlusToken) {
			return 1;
		} else if (incrementor.operator === ts.SyntaxKind.MinusMinusToken) {
			return -1;
		}
	} else if (
		ts.isBinaryExpression(incrementor) &&
		state.typeChecker.getSymbolAtLocation(incrementor.left) === symbol &&
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
	if (!ts.isIdentifier(varDec.name)) return undefined;

	const varDecInit = varDec.initializer;
	if (
		!varDecInit ||
		!(
			ts.isNumericLiteral(varDecInit) ||
			(isNumberType(state, state.getType(varDecInit)) && ts.isIdentifier(varDecInit))
		)
	) {
		return undefined;
	}

	if (!ts.isBinaryExpression(condition) || condition.left === varDec.name) return undefined;

	const idSymbol = state.typeChecker.getSymbolAtLocation(varDec.name);
	if (!idSymbol) return undefined;

	const stepValue = getIncrementorValue(state, idSymbol, incrementor);
	if (!stepValue) return undefined;

	if (
		!(condition.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken && stepValue > 0) &&
		!(condition.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken && stepValue < 0)
	) {
		return undefined;
	}

	const id = transformIdentifierDefined(state, varDec.name);
	const start = state.noPrereqs(() => transformExpression(state, varDecInit));
	const end = state.noPrereqs(() => transformExpression(state, condition.right));
	const step = stepValue === 1 ? undefined : lua.number(stepValue);
	const statements = transformStatementList(state, getStatements(statement));
	return lua.create(lua.SyntaxKind.NumericForStatement, { id, start, end, step, statements });
}

export function transformForStatement(state: TransformState, node: ts.ForStatement) {
	// if (node.initializer && node.condition && node.incrementor) {
	// 	const optimized = getOptimizedForStatement(
	// 		state,
	// 		node.initializer,
	// 		node.condition,
	// 		node.incrementor,
	// 		node.statement,
	// 	);
	// 	if (optimized) {
	// 		return lua.list.make(optimized);
	// 	}
	// }

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
		const statement = node.statement;
		const statements = transformStatementList(state, getStatements(statement));
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

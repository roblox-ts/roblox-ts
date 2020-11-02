import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformVariableDeclaration } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformWhileStatementInner } from "TSTransformer/nodes/statements/transformWhileStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getStatements } from "TSTransformer/util/getStatements";

function addIncrementor(
	list: luau.List<luau.Statement>,
	node: luau.ListNode<luau.Statement>,
	incrementor: luau.List<luau.Statement>,
) {
	assert(!luau.list.isEmpty(list));

	const statement = node.value;
	if (luau.isContinueStatement(statement)) {
		const incrementorClone = luau.list.clone(incrementor);

		if (node.prev) {
			node.prev.next = incrementorClone.head;
		} else if (node === list.head) {
			list.head = incrementorClone.head;
		}

		node.prev = incrementorClone.tail;

		incrementorClone.tail!.next = node;
	}

	if ((luau.isIfStatement(statement) || luau.isDoStatement(statement)) && statement.statements.head) {
		addIncrementor(statement.statements, statement.statements.head, incrementor);
	}

	if (node.next) {
		addIncrementor(list, node.next, incrementor);
	}
}

export function transformForStatement(state: TransformState, node: ts.ForStatement) {
	const statements = luau.list.make<luau.Statement>();

	const nodeInitializer = node.initializer;
	if (nodeInitializer) {
		if (ts.isVariableDeclarationList(nodeInitializer)) {
			for (const variableDeclaration of nodeInitializer.declarations) {
				luau.list.pushList(statements, transformVariableDeclaration(state, variableDeclaration));
			}
		} else {
			luau.list.pushList(statements, transformExpressionStatementInner(state, nodeInitializer));
		}
	}

	let whileStatement: luau.WhileStatement;
	if (node.condition) {
		whileStatement = transformWhileStatementInner(state, node.condition, node.statement);
	} else {
		const statement = node.statement;
		const statements = transformStatementList(state, getStatements(statement));
		whileStatement = luau.create(luau.SyntaxKind.WhileStatement, {
			condition: luau.bool(true),
			statements,
		});
	}

	luau.list.push(statements, whileStatement);

	const nodeIncrementor = node.incrementor;

	if (nodeIncrementor) {
		const transformed = transformExpressionStatementInner(state, nodeIncrementor);

		if (whileStatement.statements.head) {
			addIncrementor(whileStatement.statements, whileStatement.statements.head, transformed);
		}

		if (!whileStatement.statements.tail || !luau.isFinalStatement(whileStatement.statements.tail.value)) {
			luau.list.pushList(whileStatement.statements, transformed);
		}
	}

	if (statements.head === statements.tail) {
		return statements;
	} else {
		return luau.list.make<luau.Statement>(luau.create(luau.SyntaxKind.DoStatement, { statements }));
	}
}

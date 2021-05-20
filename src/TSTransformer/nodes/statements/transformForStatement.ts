import ts from "byots";
import luau from "LuauAST";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import { transformVariableDeclarationList } from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformWhileStatementInner } from "TSTransformer/nodes/statements/transformWhileStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { getStatements } from "TSTransformer/util/getStatements";

function addIncrementorToIfStatement(node: luau.IfStatement, incrementor: luau.List<luau.Statement>) {
	if (node.statements.head) {
		addIncrementor(node.statements, node.statements.head, incrementor);
	}
	if (luau.list.isList(node.elseBody)) {
		if (node.elseBody.head) {
			addIncrementor(node.elseBody, node.elseBody.head, incrementor);
		}
	} else {
		addIncrementorToIfStatement(node.elseBody, incrementor);
	}
}

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

	if (luau.isDoStatement(statement)) {
		if (statement.statements.head) {
			addIncrementor(statement.statements, statement.statements.head, incrementor);
		}
	} else if (luau.isIfStatement(statement)) {
		addIncrementorToIfStatement(statement, incrementor);
	}

	if (node.next) {
		addIncrementor(list, node.next, incrementor);
	}
}

export function transformForStatement(state: TransformState, node: ts.ForStatement): luau.List<luau.Statement> {
	const statements = luau.list.make<luau.Statement>();

	if (node.initializer) {
		if (ts.isVariableDeclarationList(node.initializer)) {
			luau.list.pushList(statements, transformVariableDeclarationList(state, node.initializer));
		} else {
			luau.list.pushList(statements, transformExpressionStatementInner(state, node.initializer));
		}
	}

	const loopInitializers = luau.list.make<luau.Statement>();
	const incrementor = luau.list.make<luau.Statement>();

	if (!ts.isEmptyStatement(node.statement)) {
		for (const symbol of state.forStatementToSymbolsMap.get(node) ?? []) {
			const id = luau.id(symbol.name);
			const tempId = state.forStatementSymbolToIdMap.get(symbol)!;
			luau.list.push(
				loopInitializers,
				luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: id,
					right: tempId,
				}),
			);
			luau.list.push(
				incrementor,
				luau.create(luau.SyntaxKind.Assignment, {
					left: tempId,
					operator: "=",
					right: id,
				}),
			);
		}
	}

	const whileStatement = transformWhileStatementInner(state, node.condition, node.statement, loopInitializers);

	if (node.incrementor) {
		const [statements, prereqs] = state.capture(() => transformExpressionStatementInner(state, node.incrementor!));
		luau.list.pushList(incrementor, prereqs);
		luau.list.pushList(incrementor, statements);
	}

	if (whileStatement.statements.head) {
		addIncrementor(whileStatement.statements, whileStatement.statements.head, incrementor);
	}

	if (!whileStatement.statements.tail || !luau.isFinalStatement(whileStatement.statements.tail.value)) {
		luau.list.pushList(whileStatement.statements, incrementor);
	}

	luau.list.push(statements, whileStatement);

	if (statements.head === statements.tail) {
		return statements;
	} else {
		return luau.list.make(luau.create(luau.SyntaxKind.DoStatement, { statements }));
	}
}

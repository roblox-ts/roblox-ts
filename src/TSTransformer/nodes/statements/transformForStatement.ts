import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import {
	isVarDeclaration,
	transformVariableDeclaration,
} from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformWhileStatementInner } from "TSTransformer/nodes/statements/transformWhileStatement";

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
	const { initializer, condition, incrementor, statement } = node;

	const result = luau.list.make<luau.Statement>();

	if (initializer) {
		if (ts.isVariableDeclarationList(initializer)) {
			if (isVarDeclaration(initializer)) {
				DiagnosticService.addDiagnostic(errors.noVar(node));
			}

			const statements = luau.list.make<luau.Statement>();
			for (const declaration of initializer.declarations) {
				const [decStatements, decPrereqs] = state.capture(() =>
					transformVariableDeclaration(state, declaration),
				);
				luau.list.pushList(statements, decPrereqs);
				luau.list.pushList(statements, decStatements);
			}

			luau.list.pushList(result, statements);
		} else {
			const [statements, prereqs] = state.capture(() => transformExpressionStatementInner(state, initializer));
			luau.list.pushList(result, prereqs);
			luau.list.pushList(result, statements);
		}
	}

	const loopInitializers = luau.list.make<luau.Statement>();
	const incrementorStatements = luau.list.make<luau.Statement>();

	if (!ts.isEmptyStatement(statement)) {
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
				incrementorStatements,
				luau.create(luau.SyntaxKind.Assignment, {
					left: tempId,
					operator: "=",
					right: id,
				}),
			);
		}
	}

	const whileStatement = transformWhileStatementInner(state, condition, statement, loopInitializers);

	if (incrementor) {
		const [statements, prereqs] = state.capture(() => transformExpressionStatementInner(state, incrementor));
		luau.list.pushList(incrementorStatements, prereqs);
		luau.list.pushList(incrementorStatements, statements);
	}

	if (whileStatement.statements.head) {
		addIncrementor(whileStatement.statements, whileStatement.statements.head, incrementorStatements);
	}

	if (!whileStatement.statements.tail || !luau.isFinalStatement(whileStatement.statements.tail.value)) {
		luau.list.pushList(whileStatement.statements, incrementorStatements);
	}

	luau.list.push(result, whileStatement);

	if (result.head === result.tail) {
		return result;
	} else {
		return luau.list.make(luau.create(luau.SyntaxKind.DoStatement, { statements: result }));
	}
}

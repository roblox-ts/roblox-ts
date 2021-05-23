import ts from "byots";
import luau from "LuauAST";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import {
	isVarDeclaration,
	transformVariableDeclaration,
} from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
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
	const { initializer, condition, incrementor, statement } = node;

	const result = luau.list.make<luau.Statement>();

	const shouldIncrement = luau.tempId();
	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.VariableDeclaration, {
			left: shouldIncrement,
			right: luau.bool(false),
		}),
	);

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

		for (const saveInfo of state.forStatementInitializerSaveInfoMap.get(node) ?? []) {
			luau.list.push(
				result,
				luau.create(luau.SyntaxKind.Assignment, {
					left: saveInfo.originalId,
					operator: "=",
					right: saveInfo.copyId,
				}),
			);
			state.forStatementSymbolToIdMap.set(saveInfo.symbol, saveInfo.originalId);
		}
	}

	const whileStatements = luau.list.make<luau.Statement>();
	const saveWriteStatements = luau.list.make<luau.Statement>();

	for (const symbol of state.forStatementToSymbolsMap.get(node) ?? []) {
		const id = luau.id(symbol.name);
		const tempId = state.forStatementSymbolToIdMap.get(symbol)!;
		luau.list.push(
			whileStatements,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: id,
				right: tempId,
			}),
		);
		luau.list.push(
			saveWriteStatements,
			luau.create(luau.SyntaxKind.Assignment, {
				left: tempId,
				operator: "=",
				right: id,
			}),
		);
	}

	const incrementorStatements = luau.list.make<luau.Statement>();
	if (incrementor) {
		const [statements, prereqs] = state.capture(() => transformExpressionStatementInner(state, incrementor));
		luau.list.pushList(incrementorStatements, prereqs);
		luau.list.pushList(incrementorStatements, statements);
	}

	luau.list.push(
		whileStatements,
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: shouldIncrement,
			statements: incrementorStatements,
			elseBody: luau.list.make(
				luau.create(luau.SyntaxKind.Assignment, {
					left: shouldIncrement,
					operator: "=",
					right: luau.bool(true),
				}),
			),
		}),
	);

	// eslint-disable-next-line prefer-const
	let [conditionExp, conditionPrereqs] = state.capture(() => {
		if (condition) {
			return createTruthinessChecks(
				state,
				transformExpression(state, condition),
				condition,
				state.getType(condition),
			);
		} else {
			return luau.bool(true);
		}
	});

	luau.list.pushList(whileStatements, conditionPrereqs);
	luau.list.push(
		whileStatements,
		luau.create(luau.SyntaxKind.IfStatement, {
			condition: luau.unary("not", conditionExp),
			statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
			elseBody: luau.list.make(),
		}),
	);

	luau.list.pushList(whileStatements, transformStatementList(state, getStatements(statement)));

	if (whileStatements.head) {
		addIncrementor(whileStatements, whileStatements.head, saveWriteStatements);
	}

	if (!whileStatements.tail || !luau.isFinalStatement(whileStatements.tail.value)) {
		luau.list.pushList(whileStatements, saveWriteStatements);
	}

	const whileStatement = luau.create(luau.SyntaxKind.WhileStatement, {
		condition: luau.bool(true),
		statements: whileStatements,
	});

	luau.list.push(result, whileStatement);

	if (result.head === result.tail) {
		return result;
	} else {
		return luau.list.make(luau.create(luau.SyntaxKind.DoStatement, { statements: result }));
	}
}

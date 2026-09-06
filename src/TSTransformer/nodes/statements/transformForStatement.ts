import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import {
	isVarDeclaration,
	transformVariableDeclaration,
} from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getDeclaredVariables } from "TSTransformer/util/getDeclaredVariables";
import { getStatements } from "TSTransformer/util/getStatements";
import { getAncestor, isAncestorOf } from "TSTransformer/util/traversal";
import ts from "typescript";

function addFinalizersToIfStatement(node: luau.IfStatement, finalizers: luau.List<luau.Statement>) {
	if (luau.list.isNonEmpty(node.statements)) {
		addFinalizers(node.statements, node.statements.head, finalizers);
	}
	if (luau.list.isList(node.elseBody)) {
		if (luau.list.isNonEmpty(node.elseBody)) {
			addFinalizers(node.elseBody, node.elseBody.head, finalizers);
		}
	} else {
		addFinalizersToIfStatement(node.elseBody, finalizers);
	}
}

function addFinalizers(
	list: luau.List<luau.Statement>,
	node: luau.ListNode<luau.Statement>,
	finalizers: luau.List<luau.Statement>,
) {
	assert(!luau.list.isEmpty(list));

	const statement = node.value;
	if (luau.isContinueStatement(statement)) {
		const finalizersClone = luau.list.clone(finalizers);

		// fix node parents
		luau.list.forEach(finalizersClone, node => (node.parent = statement.parent));

		if (node.prev) {
			node.prev.next = finalizersClone.head;
		} else if (node === list.head) {
			list.head = finalizersClone.head;
		}

		node.prev = finalizersClone.tail;

		finalizersClone.tail!.next = node;
	}

	if (luau.isDoStatement(statement)) {
		if (luau.list.isNonEmpty(statement.statements)) {
			addFinalizers(statement.statements, statement.statements.head, finalizers);
		}
	} else if (luau.isIfStatement(statement)) {
		addFinalizersToIfStatement(statement, finalizers);
	}

	if (node.next) {
		addFinalizers(list, node.next, finalizers);
	}
}

function canSkipClone(state: TransformState, initializer: ts.VariableDeclarationList, id: ts.Identifier): boolean {
	// is symbol used in initializer (besides its definition)
	return !ts.FindAllReferences.Core.isSymbolReferencedInFile(id, state.typeChecker, id.getSourceFile(), initializer);
}

function isIdWriteOrAsyncRead(state: TransformState, forStatement: ts.ForStatement, id: ts.Identifier) {
	return ts.FindAllReferences.Core.eachSymbolReferenceInFile(
		id,
		state.typeChecker,
		id.getSourceFile(),
		token => {
			// write
			if (
				ts.isWriteAccess(token) &&
				(!forStatement.incrementor || !isAncestorOf(forStatement.incrementor, token))
			) {
				return true;
			}

			// async read
			const ancestor = getAncestor(token, v => v === forStatement || ts.isFunctionLike(v));
			if (ancestor && ancestor !== forStatement) {
				return true;
			}
		},
		forStatement,
	);
}

function transformForStatementFallback(state: TransformState, node: ts.ForStatement): luau.List<luau.Statement> {
	const { initializer, condition, incrementor, statement } = node;

	const result = luau.list.make<luau.Statement>();
	const whileStatements = luau.list.make<luau.Statement>();
	const finalizerStatements = luau.list.make<luau.Statement>();

	const variables = initializer && ts.isVariableDeclarationList(initializer) ? getDeclaredVariables(initializer) : [];
	const hasWriteOrAsyncRead = new Set<ts.Symbol>();
	const skipClone = new Set<ts.Symbol>();

	if (initializer && ts.isVariableDeclarationList(initializer)) {
		for (const id of variables) {
			const symbol = state.typeChecker.getSymbolAtLocation(id);
			assert(symbol);
			if (isIdWriteOrAsyncRead(state, node, id)) {
				hasWriteOrAsyncRead.add(symbol);
			}
			if (canSkipClone(state, initializer, id)) {
				skipClone.add(symbol);
			}
		}
	}

	if (initializer) {
		if (ts.isVariableDeclarationList(initializer)) {
			if (isVarDeclaration(initializer)) {
				DiagnosticService.addDiagnostic(errors.noVar(node));
			}

			for (const id of variables) {
				const symbol = state.typeChecker.getSymbolAtLocation(id);
				assert(symbol);
				if (hasWriteOrAsyncRead.has(symbol)) {
					if (skipClone.has(symbol)) {
						state.symbolToIdMap.set(symbol, luau.tempId(id.getText()));
					} else {
						const copyId = luau.tempId(`${id.getText()}Copy`);
						state.symbolToIdMap.set(symbol, copyId);
					}
				}
			}

			for (const declaration of initializer.declarations) {
				const [decStatements, decPrereqs] = state.capture(() =>
					transformVariableDeclaration(state, declaration),
				);
				luau.list.pushList(result, decPrereqs);
				luau.list.pushList(result, decStatements);
			}

			for (const id of variables) {
				const symbol = state.typeChecker.getSymbolAtLocation(id);
				assert(symbol);
				if (hasWriteOrAsyncRead.has(symbol)) {
					let tempId: luau.TemporaryIdentifier;
					if (skipClone.has(symbol)) {
						tempId = state.symbolToIdMap.get(symbol)!;
						assert(tempId);
					} else {
						tempId = luau.tempId(id.getText());
						const copyId = state.symbolToIdMap.get(symbol);
						assert(copyId);

						// local _i = _iCopy
						luau.list.push(
							result,
							luau.create(luau.SyntaxKind.VariableDeclaration, {
								left: tempId,
								right: copyId,
							}),
						);
					}
					state.symbolToIdMap.delete(symbol);
					const realId = transformIdentifierDefined(state, id);

					// local i = _i
					luau.list.push(
						whileStatements,
						luau.create(luau.SyntaxKind.VariableDeclaration, {
							left: realId,
							right: tempId,
						}),
					);

					// _i = i
					luau.list.push(
						finalizerStatements,
						luau.create(luau.SyntaxKind.Assignment, {
							left: tempId,
							operator: "=",
							right: realId,
						}),
					);
				}
			}
		} else {
			const [statements, prereqs] = state.capture(() => transformExpressionStatementInner(state, initializer));
			luau.list.pushList(result, prereqs);
			luau.list.pushList(result, statements);
		}
	}

	if (incrementor) {
		const shouldIncrement = luau.tempId("shouldIncrement");

		// local _shouldIncrement = false
		luau.list.push(
			result,
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: shouldIncrement,
				right: luau.bool(false),
			}),
		);

		const incrementorStatements = luau.list.make<luau.Statement>();
		const [statements, prereqs] = state.capture(() => transformExpressionStatementInner(state, incrementor));
		luau.list.pushList(incrementorStatements, prereqs);
		luau.list.pushList(incrementorStatements, statements);

		// if _shouldIncrement then
		// 	[incrementorStatements]
		// else
		// 	_shouldIncrement = true
		// end
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
	}

	let [conditionExp, conditionPrereqs] = state.capture(() => {
		if (condition) {
			return createTruthinessChecks(state, transformExpression(state, condition), condition);
		} else {
			return luau.bool(true);
		}
	});

	luau.list.pushList(whileStatements, conditionPrereqs);

	if (!luau.list.isEmpty(whileStatements)) {
		if (condition) {
			// if not [conditionExp] then
			//	break
			// end
			luau.list.push(
				whileStatements,
				luau.create(luau.SyntaxKind.IfStatement, {
					condition: luau.unary("not", conditionExp),
					statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
					elseBody: luau.list.make(),
				}),
			);
		}
		conditionExp = luau.bool(true);
	}

	luau.list.pushList(whileStatements, transformStatementList(state, statement, getStatements(statement)));

	if (luau.list.isNonEmpty(whileStatements) && luau.list.isNonEmpty(finalizerStatements)) {
		addFinalizers(whileStatements, whileStatements.head, finalizerStatements);
	}

	if (!whileStatements.tail || !luau.isFinalStatement(whileStatements.tail.value)) {
		luau.list.pushList(whileStatements, finalizerStatements);
	}

	luau.list.push(
		result,
		luau.create(luau.SyntaxKind.WhileStatement, {
			condition: conditionExp,
			statements: whileStatements,
		}),
	);

	return result.head === result.tail
		? result
		: luau.list.make(luau.create(luau.SyntaxKind.DoStatement, { statements: result }));
}

// Numeric for loops evaluate their bounds once. Only literal bounds can be
// moved out of a TypeScript condition without analyzing reads and side effects.
function getIntegerLiteral(expression: ts.Expression): number | undefined {
	if (ts.isNumericLiteral(expression)) {
		const value = Number(expression.text);
		return Number.isSafeInteger(value) ? value : undefined;
	}
	if (ts.isPrefixUnaryExpression(expression) && expression.operator === ts.SyntaxKind.MinusToken) {
		const value = getIntegerLiteral(expression.operand);
		if (value !== undefined) {
			return -value;
		}
	}
}

function getOptimizedIncrementorStepValue(state: TransformState, incrementor: ts.Expression, idSymbol: ts.Symbol) {
	if (
		ts.isBinaryExpression(incrementor) &&
		ts.isIdentifier(incrementor.left) &&
		state.typeChecker.getSymbolAtLocation(incrementor.left) === idSymbol
	) {
		const value = getIntegerLiteral(incrementor.right);
		if (value !== undefined) {
			if (incrementor.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken) {
				return value;
			} else if (incrementor.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken) {
				return -value;
			}
		}
	} else if (
		(ts.isPostfixUnaryExpression(incrementor) || ts.isPrefixUnaryExpression(incrementor)) &&
		ts.isIdentifier(incrementor.operand) &&
		state.typeChecker.getSymbolAtLocation(incrementor.operand) === idSymbol
	) {
		if (incrementor.operator === ts.SyntaxKind.PlusPlusToken) {
			return 1;
		} else if (incrementor.operator === ts.SyntaxKind.MinusMinusToken) {
			return -1;
		}
	}
}

function isMutatedInBody(state: TransformState, identifier: ts.Identifier, body: ts.Statement): boolean {
	return (
		ts.FindAllReferences.Core.eachSymbolReferenceInFile(
			identifier,
			state.typeChecker,
			identifier.getSourceFile(),
			ts.isWriteAccess,
			body,
		) === true
	);
}

function transformForStatementOptimized(state: TransformState, node: ts.ForStatement) {
	const { initializer, condition, incrementor, statement } = node;

	if (
		!initializer ||
		!ts.isVariableDeclarationList(initializer) ||
		!(initializer.flags & ts.NodeFlags.Let) ||
		initializer.declarations.length !== 1
	) {
		return undefined;
	}

	const { name: decName, initializer: decInit } = initializer.declarations[0];
	if (!ts.isIdentifier(decName) || decInit === undefined) {
		return undefined;
	}

	const idSymbol = state.typeChecker.getSymbolAtLocation(decName);
	if (!idSymbol) {
		return undefined;
	}

	const startValue = getIntegerLiteral(decInit);
	if (startValue === undefined) {
		return undefined;
	}

	// require a nonzero constant step that updates the declared loop variable

	if (!incrementor) {
		return undefined;
	}

	const stepValue = getOptimizedIncrementorStepValue(state, incrementor, idSymbol);
	if (stepValue === undefined || stepValue === 0) {
		return undefined;
	}

	// validate condition exists and is a BinaryExpression with an operator that matches the incrementor

	if (
		!condition ||
		!ts.isBinaryExpression(condition) ||
		!ts.isIdentifier(condition.left) ||
		state.typeChecker.getSymbolAtLocation(condition.left) !== idSymbol
	) {
		return undefined;
	}

	if (
		condition.operatorToken.kind === ts.SyntaxKind.LessThanToken ||
		condition.operatorToken.kind === ts.SyntaxKind.LessThanEqualsToken
	) {
		// do not optimize for cases which should never run like:
		// for (let i = 10; i < 0; i--)
		if (stepValue < 0) {
			return undefined;
		}
	} else if (
		condition.operatorToken.kind === ts.SyntaxKind.GreaterThanToken ||
		condition.operatorToken.kind === ts.SyntaxKind.GreaterThanEqualsToken
	) {
		// do not optimize for cases which should never run like:
		// for (let i = 0; i > 10; i++)
		if (stepValue > 0) {
			return undefined;
		}
	} else {
		// do not optimize for other comparison operators like !==, ===
		return undefined;
	}

	const endValue = getIntegerLiteral(condition.right);
	if (endValue === undefined) {
		return undefined;
	}

	if (isMutatedInBody(state, decName, statement)) {
		return undefined;
	}

	// commit to the optimization and start transforming..

	const result = luau.list.make<luau.Statement>();

	const id = transformIdentifierDefined(state, decName);

	const start = state.noPrereqs(() => transformExpression(state, decInit));
	let end = state.noPrereqs(() => transformExpression(state, condition.right));

	const step = luau.number(stepValue);
	const statements = transformStatementList(state, statement, getStatements(statement));

	if (condition.operatorToken.kind === ts.SyntaxKind.LessThanToken) {
		end = luau.number(endValue - 1);
	} else if (condition.operatorToken.kind === ts.SyntaxKind.GreaterThanToken) {
		end = luau.number(endValue + 1);
	}

	luau.list.push(result, luau.create(luau.SyntaxKind.NumericForStatement, { id, start, end, step, statements }));

	return result;
}

export function transformForStatement(state: TransformState, node: ts.ForStatement): luau.List<luau.Statement> {
	if (state.data.projectOptions.optimizedLoops) {
		const optimized = transformForStatementOptimized(state, node);
		if (optimized) {
			return optimized;
		}
	}
	return transformForStatementFallback(state, node);
}

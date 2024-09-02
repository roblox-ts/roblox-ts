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
import { offset } from "TSTransformer/util/offset";
import { getAncestor, isAncestorOf, skipDownwards, skipUpwards } from "TSTransformer/util/traversal";
import { getFirstDefinedSymbol, isDefinitelyType } from "TSTransformer/util/types";
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
				const [decStatements, decPrereqs] = state.capture(() => {
					const result = luau.list.make<luau.Statement>();
					const [decStatements, decPrereqs] = state.capture(() =>
						transformVariableDeclaration(state, declaration),
					);
					luau.list.pushList(result, decPrereqs);
					luau.list.pushList(result, decStatements);
					return result;
				});
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

function getOptimizedIncrementorStepValue(state: TransformState, incrementor: ts.Expression, idSymbol: ts.Symbol) {
	if (
		ts.isBinaryExpression(incrementor) &&
		ts.isIdentifier(incrementor.left) &&
		state.typeChecker.getSymbolAtLocation(incrementor.left) === idSymbol &&
		incrementor.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken &&
		ts.isNumericLiteral(incrementor.right) &&
		isProbablyInteger(state, incrementor.right)
	) {
		return Number(incrementor.right.getText());
	} else if (
		ts.isBinaryExpression(incrementor) &&
		incrementor.operatorToken.kind === ts.SyntaxKind.MinusEqualsToken &&
		ts.isNumericLiteral(incrementor.right) &&
		isProbablyInteger(state, incrementor.right)
	) {
		return -Number(incrementor.right.getText());
	} else if (
		(ts.isPostfixUnaryExpression(incrementor) || ts.isPrefixUnaryExpression(incrementor)) &&
		ts.isIdentifier(incrementor.operand) &&
		state.typeChecker.getSymbolAtLocation(incrementor.operand) === idSymbol &&
		incrementor.operator === ts.SyntaxKind.PlusPlusToken
	) {
		return 1;
	} else if (
		(ts.isPostfixUnaryExpression(incrementor) || ts.isPrefixUnaryExpression(incrementor)) &&
		ts.isIdentifier(incrementor.operand) &&
		state.typeChecker.getSymbolAtLocation(incrementor.operand) === idSymbol &&
		incrementor.operator === ts.SyntaxKind.MinusMinusToken
	) {
		return -1;
	}
	return undefined;
}

function isSizeMacro(state: TransformState, expression: ts.Expression): boolean {
	if (ts.isCallExpression(expression)) {
		const expType = state.typeChecker.getNonOptionalType(state.getType(expression.expression));
		const symbol = getFirstDefinedSymbol(state, expType);
		if (symbol) {
			const macro = state.services.macroManager.getPropertyCallMacro(symbol);
			if (macro && symbol.name === "size") {
				return true;
			}
		}
	}
	return false;
}

function isMutatedInBody(state: TransformState, identifier: ts.Identifier, body: ts.Statement): boolean {
	return (
		ts.FindAllReferences.Core.eachSymbolReferenceInFile(
			identifier,
			state.typeChecker,
			identifier.getSourceFile(),
			token => {
				const parent = skipUpwards(token).parent;
				if (ts.isAssignmentExpression(parent) && skipDownwards(parent.left) === token) {
					return true;
				} else if (ts.isUnaryExpressionWithWrite(parent) && skipDownwards(parent.operand) === token) {
					return true;
				}
				return false;
			},
			body,
		) === true
	);
}

function isProbablyInteger(state: TransformState, expression: ts.Expression): boolean {
	if (ts.isNumericLiteral(expression)) {
		return Number.isInteger(Number(expression.getText()));
	} else if (ts.isBinaryExpression(expression)) {
		if (
			expression.operatorToken.kind === ts.SyntaxKind.PlusToken ||
			expression.operatorToken.kind === ts.SyntaxKind.MinusToken ||
			expression.operatorToken.kind === ts.SyntaxKind.AsteriskToken ||
			expression.operatorToken.kind === ts.SyntaxKind.AsteriskAsteriskToken
		) {
			return isProbablyInteger(state, expression.left) && isProbablyInteger(state, expression.right);
		}
	} else if (ts.isPrefixUnaryExpression(expression)) {
		if (expression.operator === ts.SyntaxKind.PlusToken || expression.operator === ts.SyntaxKind.MinusToken) {
			return isProbablyInteger(state, expression.operand);
		}
	} else if (isSizeMacro(state, expression)) {
		return true;
	} else if (isDefinitelyType(state.getType(expression), t => t.isNumberLiteral() && Number.isInteger(t.value))) {
		return true;
	}
	return false;
}

function transformForStatementOptimized(state: TransformState, node: ts.ForStatement) {
	const { initializer, condition, incrementor, statement } = node;

	// this function is difficult to break up because it uses several type guard functions..

	// validate initializer exists and is a single identifier `x` with a value that is _probably_ an integer

	if (!initializer || !ts.isVariableDeclarationList(initializer) || initializer.declarations.length !== 1) {
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

	if (!isProbablyInteger(state, decInit)) {
		return undefined;
	}

	// validate incrementor exists and is _probably_ an integer change in `x`

	if (!incrementor) {
		return undefined;
	}

	const stepValue = getOptimizedIncrementorStepValue(state, incrementor, idSymbol);
	if (stepValue === undefined) {
		return undefined;
	}

	// validate condition exists and is a BinaryExpression with an operator that matches the incrementor

	if (!condition || !ts.isBinaryExpression(condition)) {
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

	if (!isProbablyInteger(state, condition.right)) {
		return undefined;
	}

	if (isMutatedInBody(state, decName, statement)) {
		return undefined;
	}

	// commit to the optimization and start transforming..

	const result = luau.list.make<luau.Statement>();

	const id = transformIdentifierDefined(state, decName);

	const [start, startPrereqs] = state.capture(() => transformExpression(state, decInit));
	luau.list.pushList(result, startPrereqs);

	let [end, endPrereqs] = state.capture(() => transformExpression(state, condition.right));
	luau.list.pushList(result, endPrereqs);

	const step = luau.number(stepValue);
	const statements = transformStatementList(state, statement, getStatements(statement));

	if (condition.operatorToken.kind === ts.SyntaxKind.LessThanToken) {
		end = offset(end, -1);
	} else if (condition.operatorToken.kind === ts.SyntaxKind.GreaterThanToken) {
		end = offset(end, 1);
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

import luau from "@roblox-ts/luau-ast";
import { errors } from "Shared/diagnostics";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformIdentifierDefined } from "TSTransformer/nodes/expressions/transformIdentifier";
import { transformExpressionStatementInner } from "TSTransformer/nodes/statements/transformExpressionStatement";
import {
	isVarDeclaration,
	transformVariableDeclaration,
} from "TSTransformer/nodes/statements/transformVariableStatement";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getConstantInteger } from "TSTransformer/util/getConstantInteger";
import { getDeclaredVariables } from "TSTransformer/util/getDeclaredVariables";
import { getLiteralNumberValue } from "TSTransformer/util/getLiteralNumberValue";
import { getStatements } from "TSTransformer/util/getStatements";
import { offset } from "TSTransformer/util/offset";
import { getAncestor, isAncestorOf, skipDownwards } from "TSTransformer/util/traversal";
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
		} else {
			assert(node === list.head);
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
				luau.list.pushList(result, transformVariableDeclaration(state, declaration));
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
			luau.list.pushList(result, transformExpressionStatementInner(state, initializer));
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

		const incrementorStatements = transformExpressionStatementInner(state, incrementor);

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

	const conditionPrereqs = new Prereqs();
	let conditionExp = condition
		? createTruthinessChecks(
				state,
				conditionPrereqs,
				transformExpression(state, conditionPrereqs, condition),
				condition,
			)
		: luau.bool(true);

	luau.list.pushList(whileStatements, conditionPrereqs.statements);

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

function isLoopVariable(state: TransformState, expression: ts.Expression, symbol: ts.Symbol) {
	const node = skipDownwards(expression);
	return ts.isIdentifier(node) && state.typeChecker.getSymbolAtLocation(node) === symbol;
}

interface OptimizedStep {
	value: number;
	expression?: ts.Expression;
	negate: boolean;
}

function getOptimizedIncrementorStep(
	state: TransformState,
	incrementor: ts.Expression,
	idSymbol: ts.Symbol,
): OptimizedStep | undefined {
	incrementor = skipDownwards(incrementor);
	if (ts.isBinaryExpression(incrementor) && isLoopVariable(state, incrementor.left, idSymbol)) {
		let expression = incrementor.right;
		let operator = incrementor.operatorToken.kind;
		if (
			operator !== ts.SyntaxKind.EqualsToken &&
			operator !== ts.SyntaxKind.PlusEqualsToken &&
			operator !== ts.SyntaxKind.MinusEqualsToken
		) {
			return undefined;
		}

		if (operator === ts.SyntaxKind.EqualsToken) {
			const right = skipDownwards(expression);
			if (!ts.isBinaryExpression(right)) {
				return undefined;
			}

			operator = right.operatorToken.kind;
			if (isLoopVariable(state, right.left, idSymbol)) {
				expression = right.right;
			} else if (operator === ts.SyntaxKind.PlusToken && isLoopVariable(state, right.right, idSymbol)) {
				expression = right.left;
			} else {
				return undefined;
			}
		}

		if (
			operator === ts.SyntaxKind.PlusEqualsToken ||
			operator === ts.SyntaxKind.MinusEqualsToken ||
			operator === ts.SyntaxKind.PlusToken ||
			operator === ts.SyntaxKind.MinusToken
		) {
			const value = getConstantInteger(state, expression, true);
			if (value !== undefined) {
				const negate = operator === ts.SyntaxKind.MinusEqualsToken || operator === ts.SyntaxKind.MinusToken;
				return { value: negate ? -value : value, expression, negate };
			}
		}
	} else if (
		(ts.isPostfixUnaryExpression(incrementor) || ts.isPrefixUnaryExpression(incrementor)) &&
		isLoopVariable(state, incrementor.operand, idSymbol)
	) {
		if (incrementor.operator === ts.SyntaxKind.PlusPlusToken) {
			return { value: 1, negate: false };
		} else if (incrementor.operator === ts.SyntaxKind.MinusMinusToken) {
			return { value: -1, negate: false };
		}
	}
}

function getOptimizedCondition(state: TransformState, condition: ts.Expression, idSymbol: ts.Symbol) {
	condition = skipDownwards(condition);
	if (!ts.isBinaryExpression(condition)) {
		return undefined;
	}

	let bound = condition.right;
	let operator = condition.operatorToken.kind;
	if (!isLoopVariable(state, condition.left, idSymbol)) {
		if (!isLoopVariable(state, condition.right, idSymbol)) {
			return undefined;
		}

		bound = condition.left;
		switch (operator) {
			case ts.SyntaxKind.LessThanToken:
				operator = ts.SyntaxKind.GreaterThanToken;
				break;
			case ts.SyntaxKind.LessThanEqualsToken:
				operator = ts.SyntaxKind.GreaterThanEqualsToken;
				break;
			case ts.SyntaxKind.GreaterThanToken:
				operator = ts.SyntaxKind.LessThanToken;
				break;
			case ts.SyntaxKind.GreaterThanEqualsToken:
				operator = ts.SyntaxKind.LessThanEqualsToken;
				break;
		}
	}

	return { bound, operator };
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
	assert(idSymbol);

	const startValue = getConstantInteger(state, decInit);
	if (startValue === undefined) {
		return undefined;
	}

	// require a nonzero constant step that updates the declared loop variable

	if (!incrementor) {
		return undefined;
	}

	const increment = getOptimizedIncrementorStep(state, incrementor, idSymbol);
	if (!increment || increment.value === 0) {
		return undefined;
	}

	const comparison = condition && getOptimizedCondition(state, condition, idSymbol);
	if (!comparison) {
		return undefined;
	}

	const { bound, operator } = comparison;
	if (operator === ts.SyntaxKind.LessThanToken || operator === ts.SyntaxKind.LessThanEqualsToken) {
		if (increment.value < 0) {
			return undefined;
		}
	} else if (operator === ts.SyntaxKind.GreaterThanToken || operator === ts.SyntaxKind.GreaterThanEqualsToken) {
		if (increment.value > 0) {
			return undefined;
		}
	} else {
		return undefined;
	}

	if (getConstantInteger(state, bound) === undefined) {
		return undefined;
	}

	if (isMutatedInBody(state, decName, statement)) {
		return undefined;
	}

	// commit to the optimization and start transforming..

	const result = luau.list.make<luau.Statement>();

	const id = transformIdentifierDefined(state, decName);

	const startPrereqs = new Prereqs();
	const start = transformExpression(state, startPrereqs, decInit);
	assert(luau.list.isEmpty(startPrereqs.statements));
	const endPrereqs = new Prereqs();
	let end = transformExpression(state, endPrereqs, bound);
	assert(luau.list.isEmpty(endPrereqs.statements));

	let step: luau.Expression = luau.number(increment.value);
	if (increment.expression) {
		const stepPrereqs = new Prereqs();
		const expression = transformExpression(state, stepPrereqs, increment.expression);
		assert(luau.list.isEmpty(stepPrereqs.statements));

		// retain references and arithmetic, but keep the existing compact spelling of literal steps
		if (getLiteralNumberValue(expression) === undefined) {
			step = increment.negate ? luau.unary("-", expression) : expression;
		}
	}

	const statements = transformStatementList(state, statement, getStatements(statement));

	if (operator === ts.SyntaxKind.LessThanToken) {
		end = offset(end, -1);
	} else if (operator === ts.SyntaxKind.GreaterThanToken) {
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

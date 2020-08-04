import ts from "byots";
import luau from "LuauAST";
import { TransformState, TryUses } from "TSTransformer";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import {
	isBreakBlockedByTryStatement,
	isReturnBlockedByTryStatement,
} from "TSTransformer/util/isBlockedByTryStatement";

function transformCatchClause(state: TransformState, node: ts.CatchClause) {
	const parameters = luau.list.make<luau.AnyIdentifier>();
	const statements = luau.list.make<luau.Statement>();

	if (node.variableDeclaration) {
		luau.list.push(parameters, transformBindingName(state, node.variableDeclaration.name, statements));
	}

	luau.list.pushList(statements, transformStatementList(state, node.block.statements));

	const catchFunction = luau.create(luau.SyntaxKind.FunctionExpression, {
		parameters,
		hasDotDotDot: false,
		statements,
	});

	return catchFunction;
}

function transformIntoTryCall(
	state: TransformState,
	node: ts.TryStatement,
	exitTypeId: luau.TemporaryIdentifier,
	returnsId: luau.TemporaryIdentifier,
	tryUses: TryUses,
) {
	const tryCallArgs = luau.list.make<luau.Expression>();

	luau.list.push(
		tryCallArgs,
		luau.create(luau.SyntaxKind.FunctionExpression, {
			parameters: luau.list.make(),
			hasDotDotDot: false,
			statements: transformStatementList(state, node.tryBlock.statements),
		}),
	);

	if (node.catchClause) {
		luau.list.push(tryCallArgs, transformCatchClause(state, node.catchClause));
	} else if (node.finallyBlock) {
		luau.list.push(tryCallArgs, luau.nil());
	}

	if (node.finallyBlock) {
		luau.list.push(
			tryCallArgs,
			luau.create(luau.SyntaxKind.FunctionExpression, {
				parameters: luau.list.make(),
				hasDotDotDot: false,
				statements: transformStatementList(state, node.finallyBlock.statements),
			}),
		);
	}

	if (!tryUses.usesReturn && !tryUses.usesBreak && !tryUses.usesContinue) {
		return luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.create(luau.SyntaxKind.CallExpression, {
				expression: state.TS("try"),
				args: tryCallArgs,
			}),
		});
	}

	return luau.create(luau.SyntaxKind.VariableDeclaration, {
		left: luau.list.make(exitTypeId, returnsId),
		right: luau.create(luau.SyntaxKind.CallExpression, {
			expression: state.TS("try"),
			args: tryCallArgs,
		}),
	});
}

function createFlowControlCondition(
	state: TransformState,
	exitTypeId: luau.TemporaryIdentifier,
	flowControlConstant: string,
) {
	return luau.binary(exitTypeId, "==", state.TS(flowControlConstant));
}

type FlowControlCase = { condition?: luau.Expression; statements: luau.List<luau.Statement> };

function collapseFlowControlCases(exitTypeId: luau.TemporaryIdentifier, cases: Array<FlowControlCase>) {
	if (cases.length === 0) {
		return luau.list.make<luau.Statement>();
	} else {
		let nextStatements = luau.create(luau.SyntaxKind.IfStatement, {
			condition: exitTypeId,
			statements: cases[cases.length - 1].statements,
			elseBody: luau.list.make(),
		});
		for (let i = cases.length - 2; i >= 0; i--) {
			nextStatements = luau.create(luau.SyntaxKind.IfStatement, {
				condition: cases[i].condition || exitTypeId,
				statements: cases[i].statements,
				elseBody: nextStatements,
			});
		}
		return luau.list.make(nextStatements);
	}
}

function transformFlowControl(
	state: TransformState,
	node: ts.TryStatement,
	exitTypeId: luau.TemporaryIdentifier,
	returnsId: luau.TemporaryIdentifier,
	tryUses: TryUses,
) {
	const flowControlCases = new Array<FlowControlCase>();

	if (!tryUses.usesReturn && !tryUses.usesBreak && !tryUses.usesContinue) {
		return luau.list.make();
	}

	const returnBlocked = isReturnBlockedByTryStatement(node.parent);
	const breakBlocked = isBreakBlockedByTryStatement(node.parent);

	if (tryUses.usesReturn && returnBlocked) {
		state.markTryUses("usesReturn");
	}
	if (tryUses.usesBreak && breakBlocked) {
		state.markTryUses("usesBreak");
	}
	if (tryUses.usesContinue && breakBlocked) {
		state.markTryUses("usesContinue");
	}

	if (tryUses.usesReturn) {
		if (returnBlocked) {
			flowControlCases.push({
				condition: createFlowControlCondition(state, exitTypeId, "TRY_RETURN"),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.ReturnStatement, {
						expression: luau.list.make(exitTypeId, returnsId),
					}),
				),
			});
			if (breakBlocked) {
				return collapseFlowControlCases(exitTypeId, flowControlCases);
			}
		} else {
			flowControlCases.push({
				condition: createFlowControlCondition(state, exitTypeId, "TRY_RETURN"),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.ReturnStatement, {
						expression: luau.create(luau.SyntaxKind.CallExpression, {
							expression: luau.globals.unpack,
							args: luau.list.make<luau.Expression>(returnsId),
						}),
					}),
				),
			});
		}
	}

	if (tryUses.usesBreak || tryUses.usesContinue) {
		if (breakBlocked) {
			flowControlCases.push({
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.ReturnStatement, {
						expression: exitTypeId,
					}),
				),
			});
		} else {
			if (tryUses.usesBreak) {
				flowControlCases.push({
					condition: createFlowControlCondition(state, exitTypeId, "TRY_BREAK"),
					statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
				});
			}
			if (tryUses.usesContinue) {
				flowControlCases.push({
					condition: createFlowControlCondition(state, exitTypeId, "TRY_CONTINUE"),
					statements: luau.list.make(luau.create(luau.SyntaxKind.ContinueStatement, {})),
				});
			}
		}
	}

	return collapseFlowControlCases(exitTypeId, flowControlCases);
}

export function transformTryStatement(state: TransformState, node: ts.TryStatement) {
	const statements = luau.list.make<luau.Statement>();
	const exitTypeId = luau.tempId();
	const returnsId = luau.tempId();

	const tryUses = state.pushTryUsesStack();
	luau.list.push(statements, transformIntoTryCall(state, node, exitTypeId, returnsId, tryUses));
	state.popTryUsesStack();

	luau.list.pushList(statements, transformFlowControl(state, node, exitTypeId, returnsId, tryUses));

	return statements;
}

import luau from "@roblox-ts/luau-ast";
import { assert } from "Shared/util/assert";
import { TransformState } from "TSTransformer";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { TryUses } from "TSTransformer/types";
import {
	isBreakBlockedByTryStatement,
	isReturnBlockedByTryStatement,
} from "TSTransformer/util/isBlockedByTryStatement";
import ts from "typescript";

function transformCatchClause(state: TransformState, node: ts.CatchClause) {
	const parameters = luau.list.make<luau.AnyIdentifier>();
	const statements = luau.list.make<luau.Statement>();

	if (node.variableDeclaration) {
		luau.list.push(parameters, transformBindingName(state, node.variableDeclaration.name, statements));
	}

	luau.list.pushList(statements, transformStatementList(state, node.block, node.block.statements));

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
	const tryCallArgs = new Array<luau.Expression>();

	tryCallArgs.push(
		luau.create(luau.SyntaxKind.FunctionExpression, {
			parameters: luau.list.make(),
			hasDotDotDot: false,
			statements: transformStatementList(state, node.tryBlock, node.tryBlock.statements),
		}),
	);

	if (node.catchClause) {
		tryCallArgs.push(transformCatchClause(state, node.catchClause));
	} else {
		assert(node.finallyBlock);
		tryCallArgs.push(luau.nil());
	}

	if (node.finallyBlock) {
		tryCallArgs.push(
			luau.create(luau.SyntaxKind.FunctionExpression, {
				parameters: luau.list.make(),
				hasDotDotDot: false,
				statements: transformStatementList(state, node.finallyBlock, node.finallyBlock.statements),
			}),
		);
	}

	if (!tryUses.usesReturn && !tryUses.usesBreak && !tryUses.usesContinue) {
		return luau.create(luau.SyntaxKind.CallStatement, {
			expression: luau.call(state.TS(node, "try"), tryCallArgs),
		});
	}

	return luau.create(luau.SyntaxKind.VariableDeclaration, {
		left: luau.list.make(exitTypeId, returnsId),
		right: luau.call(state.TS(node, "try"), tryCallArgs),
	});
}

function createFlowControlCondition(
	state: TransformState,
	node: ts.Node,
	exitTypeId: luau.TemporaryIdentifier,
	flowControlConstant: string,
) {
	return luau.binary(exitTypeId, "==", state.TS(node, flowControlConstant));
}

type FlowControlCase = { condition?: luau.Expression; statements: luau.List<luau.Statement> };

function collapseFlowControlCases(exitTypeId: luau.TemporaryIdentifier, cases: Array<FlowControlCase>) {
	assert(cases.length > 0);

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
				condition: createFlowControlCondition(state, node, exitTypeId, "TRY_RETURN"),
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
				condition: createFlowControlCondition(state, node, exitTypeId, "TRY_RETURN"),
				statements: luau.list.make(
					luau.create(luau.SyntaxKind.ReturnStatement, {
						expression: luau.call(luau.globals.unpack, [returnsId]),
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
					condition: createFlowControlCondition(state, node, exitTypeId, "TRY_BREAK"),
					statements: luau.list.make(luau.create(luau.SyntaxKind.BreakStatement, {})),
				});
			}
			if (tryUses.usesContinue) {
				flowControlCases.push({
					condition: createFlowControlCondition(state, node, exitTypeId, "TRY_CONTINUE"),
					statements: luau.list.make(luau.create(luau.SyntaxKind.ContinueStatement, {})),
				});
			}
		}
	}

	return collapseFlowControlCases(exitTypeId, flowControlCases);
}

export function transformTryStatement(state: TransformState, node: ts.TryStatement) {
	const statements = luau.list.make<luau.Statement>();
	const exitTypeId = luau.tempId("exitType");
	const returnsId = luau.tempId("returns");

	const tryUses = state.pushTryUsesStack();
	luau.list.push(statements, transformIntoTryCall(state, node, exitTypeId, returnsId, tryUses));
	state.popTryUsesStack();

	luau.list.pushList(statements, transformFlowControl(state, node, exitTypeId, returnsId, tryUses));

	return statements;
}

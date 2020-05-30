import ts from "byots";
import * as lua from "LuaAST";
import { TransformState, TryUses } from "TSTransformer";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import {
	isBreakBlockedByTryStatement,
	isReturnBlockedByTryStatement,
} from "TSTransformer/util/isBlockedByTryStatement";
import { transformBindingName } from "TSTransformer/nodes/binding/transformBindingName";

function transformCatchClause(state: TransformState, node: ts.CatchClause) {
	const parameters = lua.list.make<lua.AnyIdentifier>();
	const statements = lua.list.make<lua.Statement>();

	if (node.variableDeclaration) {
		lua.list.push(parameters, transformBindingName(state, node.variableDeclaration.name, statements));
	}

	lua.list.pushList(statements, transformStatementList(state, node.block.statements));

	const catchFunction = lua.create(lua.SyntaxKind.FunctionExpression, {
		parameters,
		hasDotDotDot: false,
		statements,
	});

	return catchFunction;
}

function transformIntoTryCall(
	state: TransformState,
	node: ts.TryStatement,
	exitTypeId: lua.TemporaryIdentifier,
	returnsId: lua.TemporaryIdentifier,
	tryUses: TryUses,
) {
	const tryCallArgs = lua.list.make<lua.Expression>();

	lua.list.push(
		tryCallArgs,
		lua.create(lua.SyntaxKind.FunctionExpression, {
			parameters: lua.list.make(),
			hasDotDotDot: false,
			statements: transformStatementList(state, node.tryBlock.statements),
		}),
	);

	if (node.catchClause) {
		lua.list.push(tryCallArgs, transformCatchClause(state, node.catchClause));
	} else if (node.finallyBlock) {
		lua.list.push(tryCallArgs, lua.nil());
	}

	if (node.finallyBlock) {
		lua.list.push(
			tryCallArgs,
			lua.create(lua.SyntaxKind.FunctionExpression, {
				parameters: lua.list.make(),
				hasDotDotDot: false,
				statements: transformStatementList(state, node.finallyBlock.statements),
			}),
		);
	}

	if (!tryUses.usesReturn && !tryUses.usesBreak && !tryUses.usesContinue) {
		return lua.create(lua.SyntaxKind.CallStatement, {
			expression: lua.create(lua.SyntaxKind.CallExpression, {
				expression: state.TS("try"),
				args: tryCallArgs,
			}),
		});
	}

	return lua.create(lua.SyntaxKind.VariableDeclaration, {
		left: lua.list.make(exitTypeId, returnsId),
		right: lua.create(lua.SyntaxKind.CallExpression, {
			expression: state.TS("try"),
			args: tryCallArgs,
		}),
	});
}

function createFlowControlCondition(
	state: TransformState,
	exitTypeId: lua.TemporaryIdentifier,
	flowControlConstant: string,
) {
	return lua.binary(exitTypeId, "==", state.TS(flowControlConstant));
}

type FlowControlCase = { condition?: lua.Expression; statements: lua.List<lua.Statement> };

function collapseFlowControlCases(exitTypeId: lua.TemporaryIdentifier, cases: Array<FlowControlCase>) {
	if (cases.length === 0) {
		return lua.list.make<lua.Statement>();
	} else {
		let nextStatements = lua.create(lua.SyntaxKind.IfStatement, {
			condition: exitTypeId,
			statements: cases[cases.length - 1].statements,
			elseBody: lua.list.make(),
		});
		for (let i = cases.length - 2; i >= 0; i--) {
			nextStatements = lua.create(lua.SyntaxKind.IfStatement, {
				condition: cases[i].condition || exitTypeId,
				statements: cases[i].statements,
				elseBody: nextStatements,
			});
		}
		return lua.list.make(nextStatements);
	}
}

function transformFlowControl(
	state: TransformState,
	node: ts.TryStatement,
	exitTypeId: lua.TemporaryIdentifier,
	returnsId: lua.TemporaryIdentifier,
	tryUses: TryUses,
) {
	const flowControlCases = new Array<FlowControlCase>();

	if (!tryUses.usesReturn && !tryUses.usesBreak && !tryUses.usesContinue) {
		return lua.list.make();
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
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.ReturnStatement, {
						expression: lua.list.make(exitTypeId, returnsId),
					}),
				),
			});
			if (breakBlocked) {
				return collapseFlowControlCases(exitTypeId, flowControlCases);
			}
		} else {
			flowControlCases.push({
				condition: createFlowControlCondition(state, exitTypeId, "TRY_RETURN"),
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.ReturnStatement, {
						expression: lua.create(lua.SyntaxKind.CallExpression, {
							expression: lua.globals.unpack,
							args: lua.list.make<lua.Expression>(returnsId),
						}),
					}),
				),
			});
		}
	}

	if (tryUses.usesBreak || tryUses.usesContinue) {
		if (breakBlocked) {
			flowControlCases.push({
				statements: lua.list.make(
					lua.create(lua.SyntaxKind.ReturnStatement, {
						expression: exitTypeId,
					}),
				),
			});
		} else {
			if (tryUses.usesBreak) {
				flowControlCases.push({
					condition: createFlowControlCondition(state, exitTypeId, "TRY_BREAK"),
					statements: lua.list.make(lua.create(lua.SyntaxKind.BreakStatement, {})),
				});
			}
			if (tryUses.usesContinue) {
				flowControlCases.push({
					condition: createFlowControlCondition(state, exitTypeId, "TRY_CONTINUE"),
					statements: lua.list.make(lua.create(lua.SyntaxKind.ContinueStatement, {})),
				});
			}
		}
	}

	return collapseFlowControlCases(exitTypeId, flowControlCases);
}

export function transformTryStatement(state: TransformState, node: ts.TryStatement) {
	const statements = lua.list.make<lua.Statement>();
	const exitTypeId = lua.tempId();
	const returnsId = lua.tempId();

	const tryUses = state.pushTryUsesStack();
	lua.list.push(statements, transformIntoTryCall(state, node, exitTypeId, returnsId, tryUses));
	state.popTryUsesStack();

	lua.list.pushList(statements, transformFlowControl(state, node, exitTypeId, returnsId, tryUses));

	return statements;
}

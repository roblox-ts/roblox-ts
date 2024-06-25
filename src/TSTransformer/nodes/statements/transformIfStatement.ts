import luau from "@roblox-ts/luau-ast";
import { TransformState } from "TSTransformer";
import { Prereqs } from "TSTransformer/classes/Prereqs";
import { transformExpression } from "TSTransformer/nodes/expressions/transformExpression";
import { transformStatementList } from "TSTransformer/nodes/transformStatementList";
import { createTruthinessChecks } from "TSTransformer/util/createTruthinessChecks";
import { getStatements } from "TSTransformer/util/getStatements";
import ts from "typescript";

export function transformIfStatementInner(
	state: TransformState,
	prereqs: Prereqs,
	node: ts.IfStatement,
): luau.IfStatement {
	const condition = createTruthinessChecks(
		state,
		prereqs,
		transformExpression(state, prereqs, node.expression),
		node.expression,
	);

	const statements = transformStatementList(state, node.thenStatement, getStatements(node.thenStatement));

	const elseStatement = node.elseStatement;

	let elseBody: luau.IfStatement | luau.List<luau.Statement>;
	if (elseStatement === undefined) {
		elseBody = luau.list.make<luau.Statement>();
	} else if (ts.isIfStatement(elseStatement)) {
		const elseIfPrereqs = new Prereqs();
		const elseIf = transformIfStatementInner(state, prereqs, elseStatement);
		if (luau.list.isEmpty(elseIfPrereqs.statements)) {
			elseBody = elseIf;
		} else {
			const elseIfStatements = luau.list.make<luau.Statement>();
			luau.list.pushList(elseIfStatements, elseIfPrereqs.statements);
			luau.list.push(elseIfStatements, elseIf);
			elseBody = elseIfStatements;
		}
	} else {
		elseBody = transformStatementList(state, elseStatement, getStatements(elseStatement));
	}

	return luau.create(luau.SyntaxKind.IfStatement, {
		condition,
		statements,
		elseBody,
	});
}

export function transformIfStatement(state: TransformState, prereqs: Prereqs, node: ts.IfStatement) {
	return luau.list.make(transformIfStatementInner(state, prereqs, node));
}

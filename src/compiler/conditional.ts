import * as ts from "ts-morph";
import { compileExpression, compileTruthyCheck } from ".";
import { CompilerState, DeclarationContext } from "../CompilerState";
import { makeSetStatement, removeBalancedParenthesisFromStringBorders, skipNodesDownwards } from "../utility/general";

function compileConditionalBlock(
	state: CompilerState,
	id: string,
	whenCondition: ts.Expression,
	subDeclaration: DeclarationContext,
) {
	state.pushIndent();
	state.declarationContext.set(whenCondition, subDeclaration);
	state.pushIdStack();
	const whenTrueStr = compileExpression(state, whenCondition);
	if (state.declarationContext.delete(whenCondition) && id !== whenTrueStr) {
		state.pushPrecedingStatements(whenCondition, makeSetStatement(state, id, whenTrueStr));
	}
	state.popIdStack();
	state.popIndent();
}

export function compileConditionalExpression(state: CompilerState, node: ts.ConditionalExpression) {
	let id: string | undefined;
	const currentConditionalContext = state.currentConditionalContext;
	const declaration = state.declarationContext.get(node);

	const condition = skipNodesDownwards(node.getCondition());
	const whenTrue = skipNodesDownwards(node.getWhenTrue());
	const whenFalse = skipNodesDownwards(node.getWhenFalse());
	let isPushed = false;

	if (declaration) {
		if (declaration.needsLocalizing) {
			state.pushPrecedingStatements(node, state.indent + `local ${declaration.set};\n`);
		}

		id = declaration.set;
		state.declarationContext.delete(node);
	} else {
		if (currentConditionalContext === "") {
			id = state.pushPrecedingStatementToNewId(node, "");
			isPushed = true;
		} else {
			id = currentConditionalContext;
		}
	}

	const subDeclaration = { isIdentifier: declaration ? declaration.isIdentifier : true, set: id } as const;
	const conditionStr = removeBalancedParenthesisFromStringBorders(compileTruthyCheck(state, condition));
	state.currentConditionalContext = id;

	state.pushPrecedingStatements(condition, state.indent + `if ${conditionStr} then\n`);
	compileConditionalBlock(state, id, whenTrue, subDeclaration);
	state.pushPrecedingStatements(whenFalse, state.indent + `else\n`);
	compileConditionalBlock(state, id, whenFalse, subDeclaration);
	state.pushPrecedingStatements(whenFalse, state.indent + `end;\n`);

	if (currentConditionalContext === "") {
		state.currentConditionalContext = "";
	}
	state.getCurrentPrecedingStatementContext(node).isPushed = isPushed;
	return id;
}

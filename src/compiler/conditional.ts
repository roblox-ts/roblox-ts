import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { makeSetStatement, removeBalancedParenthesisFromStringBorders } from "../utility";

export function compileConditionalExpression(state: CompilerState, node: ts.ConditionalExpression) {
	let id: string | undefined;
	const currentConditionalContext = state.currentConditionalContext;

	const declaration = state.declarationContext.get(node);

	const condition = node.getCondition();
	const whenTrue = node.getWhenTrue();
	const whenFalse = node.getWhenFalse();
	let conditionStr: string;

	if (declaration) {
		conditionStr = compileExpression(state, condition);
		if (declaration.needsLocalizing) {
			state.pushPrecedingStatements(node, state.indent + "local " + declaration.set + ";\n");
		}
		id = declaration.set;
		state.currentConditionalContext = id;
	} else {
		if (currentConditionalContext === "") {
			id = state.pushPrecedingStatementToNewId(node, "");
			state.currentConditionalContext = id;
		} else {
			id = currentConditionalContext;
		}
		conditionStr = compileExpression(state, condition);
	}

	state.pushPrecedingStatements(condition, state.indent + `if ${conditionStr} then\n`);
	state.pushIndent();

	state.declarationContext.set(whenTrue, { isIdentifier: declaration ? declaration.isIdentifier : true, set: id });

	const whenTrueStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, whenTrue));
	if (state.declarationContext.delete(whenTrue) && id !== whenTrueStr) {
		state.pushPrecedingStatements(whenTrue, state.indent + makeSetStatement(id, whenTrueStr) + ";\n");
	}

	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `else\n`);
	state.pushIndent();

	state.declarationContext.set(whenFalse, { isIdentifier: declaration ? declaration.isIdentifier : true, set: id });
	const whenFalseStr = removeBalancedParenthesisFromStringBorders(compileExpression(state, whenFalse));
	if (state.declarationContext.delete(whenFalse) && id !== whenFalseStr) {
		state.pushPrecedingStatements(whenFalse, state.indent + makeSetStatement(id, whenFalseStr) + ";\n");
	}
	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `end;\n`);

	if (currentConditionalContext === "") {
		state.currentConditionalContext = "";
	}
	state.getCurrentPrecedingStatementContext(node).isPushed = true;
	state.declarationContext.delete(node);
	return id || "";
}

import * as ts from "ts-morph";
import { assertNonLuaTuple, compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { makeSetStatement, skipNodesDownwards } from "../utility";

export function compileConditionalExpression(state: CompilerState, node: ts.ConditionalExpression) {
	let id: string | undefined;
	const currentConditionalContext = state.currentConditionalContext;

	const declaration = state.declarationContext.get(node);

	const condition = assertNonLuaTuple(skipNodesDownwards(node.getCondition()));
	const whenTrue = skipNodesDownwards(node.getWhenTrue());
	const whenFalse = skipNodesDownwards(node.getWhenFalse());
	let conditionStr: string;
	let isPushed = false;

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
			isPushed = true;
		} else {
			id = currentConditionalContext;
		}
		conditionStr = compileExpression(state, condition);
	}

	state.pushPrecedingStatements(condition, state.indent + `if ${conditionStr} then\n`);
	state.pushIndent();

	state.declarationContext.set(whenTrue, { isIdentifier: declaration ? declaration.isIdentifier : true, set: id });
	state.pushIdStack();
	const whenTrueStr = compileExpression(state, whenTrue);
	if (state.declarationContext.delete(whenTrue) && id !== whenTrueStr) {
		state.pushPrecedingStatements(whenTrue, state.indent + makeSetStatement(id, whenTrueStr) + ";\n");
	}
	state.popIdStack();
	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `else\n`);
	state.pushIndent();
	state.pushIdStack();

	state.declarationContext.set(whenFalse, { isIdentifier: declaration ? declaration.isIdentifier : true, set: id });
	const whenFalseStr = compileExpression(state, whenFalse);
	if (state.declarationContext.delete(whenFalse) && id !== whenFalseStr) {
		state.pushPrecedingStatements(whenFalse, state.indent + makeSetStatement(id, whenFalseStr) + ";\n");
	}
	state.popIdStack();
	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `end;\n`);

	if (currentConditionalContext === "") {
		state.currentConditionalContext = "";
	}
	state.declarationContext.delete(node);
	state.getCurrentPrecedingStatementContext(node).isPushed = isPushed;
	return id || "";
}

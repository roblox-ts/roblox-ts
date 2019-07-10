import * as ts from "ts-morph";
import { compileExpression, compileTruthyCheck } from ".";
import { CompilerState } from "../CompilerState";
import { makeSetStatement, skipNodesDownwards } from "../utility";

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

		state.currentConditionalContext = id = declaration.set;
	} else {
		if (currentConditionalContext === "") {
			state.currentConditionalContext = id = state.pushPrecedingStatementToNewId(node, "");
			isPushed = true;
		} else {
			id = currentConditionalContext;
		}
	}

	const subDeclaration = { isIdentifier: declaration ? declaration.isIdentifier : true, set: id } as const;
	const conditionStr = compileTruthyCheck(state, condition);
	state.pushPrecedingStatements(condition, state.indent + `if ${conditionStr} then\n`);
	state.pushIndent();

	state.declarationContext.set(whenTrue, subDeclaration);
	state.pushIdStack();
	const whenTrueStr = compileExpression(state, whenTrue);
	if (state.declarationContext.delete(whenTrue) && id !== whenTrueStr) {
		state.pushPrecedingStatements(whenTrue, makeSetStatement(state, id, whenTrueStr));
	}
	state.popIdStack();
	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `else\n`);
	state.pushIndent();
	state.pushIdStack();

	state.declarationContext.set(whenFalse, subDeclaration);
	const whenFalseStr = compileExpression(state, whenFalse);
	if (state.declarationContext.delete(whenFalse) && id !== whenFalseStr) {
		state.pushPrecedingStatements(whenFalse, makeSetStatement(state, id, whenFalseStr));
	}
	state.popIdStack();
	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `end;\n`);

	if (currentConditionalContext === "") {
		state.currentConditionalContext = "";
	}
	state.declarationContext.delete(node);
	state.getCurrentPrecedingStatementContext(node).isPushed = isPushed;
	return id;
}

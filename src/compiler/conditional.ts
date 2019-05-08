import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";
import { makeSetStatement } from "../utility";

export function unwrapEndParens(str: string) {
	// Not very sophisticated, but because we are only matching things of the form ((_N))
	// and _N is blocked as an identifier in Roblox-TS
	// This will always work for this case

	const match = str.match(/^\(*(_\d+)\)*$/);

	if (match) {
		const [, innerStr] = match;
		return innerStr;
	} else {
		return str;
	}
}

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
	} else {
		if (currentConditionalContext === "") {
			[id] = state.pushPrecedingStatementToNewIds(node, "", 1);
			state.currentConditionalContext = id;
		} else {
			id = currentConditionalContext;
		}
		conditionStr = compileExpression(state, condition);
	}

	state.pushPrecedingStatements(condition, state.indent + `if ${conditionStr} then\n`);
	state.pushIndent();

	state.declarationContext.set(whenTrue, { isIdentifier: declaration ? declaration.isIdentifier : true, set: id });

	const whenTrueStr = unwrapEndParens(compileExpression(state, whenTrue));
	if (state.declarationContext.delete(whenTrue)) {
		state.pushPrecedingStatements(whenTrue, state.indent + makeSetStatement(id, whenTrueStr) + ";\n");
	}

	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `else\n`);
	state.pushIndent();

	state.declarationContext.set(whenFalse, { isIdentifier: declaration ? declaration.isIdentifier : true, set: id });
	const whenFalseStr = unwrapEndParens(compileExpression(state, whenFalse));
	if (state.declarationContext.delete(whenFalse)) {
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

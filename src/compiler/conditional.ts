import * as ts from "ts-morph";
import { compileExpression } from ".";
import { CompilerState } from "../CompilerState";

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
	let id: string;
	const currentConditionalContext = state.currentConditionalContext;

	if (currentConditionalContext === "") {
		id = state.getNewId();
		state.currentConditionalContext = id;
		state.pushPrecedingStatements(state.indent + `local ${id};\n`);
	} else {
		id = currentConditionalContext;
	}
	state.pushPrecedingStatements(state.indent + `if ${compileExpression(state, node.getCondition())} then\n`);
	state.pushIndent();
	const whenTrueStr = unwrapEndParens(compileExpression(state, node.getWhenTrue()));

	if (id !== whenTrueStr) {
		state.pushPrecedingStatements(state.indent + `${id} = ${whenTrueStr};\n`);
	}
	state.popIndent();
	state.pushPrecedingStatements(state.indent + `else\n`);
	state.pushIndent();
	const whenFalseStr = unwrapEndParens(compileExpression(state, node.getWhenFalse()));
	if (id !== whenFalseStr) {
		state.pushPrecedingStatements(state.indent + `${id} = ${whenFalseStr};\n`);
	}
	state.popIndent();
	state.pushPrecedingStatements(state.indent + `end;\n`);

	if (currentConditionalContext === "") {
		state.currentConditionalContext = "";
	}
	return id;
}

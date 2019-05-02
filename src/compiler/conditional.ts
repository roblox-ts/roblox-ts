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
		state.pushPrecedingStatements(node, state.indent + `local ${id};\n`);
	} else {
		id = currentConditionalContext;
	}
	const condition = node.getCondition();
	const whenTrue = node.getWhenTrue();
	const whenFalse = node.getWhenFalse();

	state.pushPrecedingStatements(condition, state.indent + `if ${compileExpression(state, condition)} then\n`);
	state.pushIndent();
	const whenTrueStr = unwrapEndParens(compileExpression(state, whenTrue));

	if (id !== whenTrueStr) {
		state.pushPrecedingStatements(whenTrue, state.indent + `${id} = ${whenTrueStr};\n`);
	}

	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `else\n`);
	state.pushIndent();
	const whenFalseStr = unwrapEndParens(compileExpression(state, whenFalse));
	if (id !== whenFalseStr) {
		state.pushPrecedingStatements(whenFalse, state.indent + `${id} = ${whenFalseStr};\n`);
	}
	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `end;\n`);

	if (currentConditionalContext === "") {
		state.currentConditionalContext = "";
	}
	return id;
}

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

	// const parent = node.getParent();
	console.log([...state.declarationContext.keys()].map(key => key.getKindName() + " " + key.getText()));
	console.log(0, node.getKindName(), node.getText(), state.declarationContext.get(node));

	const declaration = state.declarationContext.get(node);

	if (currentConditionalContext === "") {
		[id] = state.pushPrecedingStatementToNewIds(node, "", 1);
		state.currentConditionalContext = id;
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
		state.pushPrecedingStatements(whenTrue, state.indent + `${declaration || `${id} = `}${whenTrueStr};\n`);
	}

	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `else\n`);
	state.pushIndent();
	const whenFalseStr = unwrapEndParens(compileExpression(state, whenFalse));
	if (id !== whenFalseStr) {
		state.pushPrecedingStatements(whenFalse, state.indent + `${declaration || `${id} = `}${whenFalseStr};\n`);
	}
	state.popIndent();
	state.pushPrecedingStatements(whenFalse, state.indent + `end;\n`);

	if (currentConditionalContext === "") {
		state.currentConditionalContext = "";
	}
	state.getCurrentPrecedingStatementContext(node).isPushed = true;
	state.declarationContext.delete(node);
	return id;
}

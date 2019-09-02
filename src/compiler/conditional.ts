import * as ts from "ts-morph";
import { compileExpression, compileTruthyCheck } from ".";
import { CompilerState, DeclarationContext } from "../CompilerState";
import { makeSetStatement, skipNodesDownwards, skipNodesUpwardsLookAhead } from "../utility/general";
import { isExpInTruthyCheck } from "./truthiness";

function compileConditionalBlock(
	state: CompilerState,
	id: string,
	whenCondition: ts.Expression,
	subDeclaration: DeclarationContext,
	isInTruthyCheck: boolean,
) {
	state.pushIndent();
	state.declarationContext.set(whenCondition, subDeclaration);
	state.pushIdStack();
	const whenTrueStr = isInTruthyCheck
		? compileTruthyCheck(state, whenCondition)
		: compileExpression(state, whenCondition);

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

	const isInTruthyCheck = Boolean(isExpInTruthyCheck(node));

	if (isInTruthyCheck) {
		state.alreadyCheckedTruthyConditionals.push(skipNodesUpwardsLookAhead(node));
	}

	const condition = skipNodesDownwards(node.getCondition());
	const whenTrue = skipNodesDownwards(node.getWhenTrue());
	const whenFalse = skipNodesDownwards(node.getWhenFalse());
	let isPushed = false;
	let conditionStr: string;

	// Perform these steps in the proper order in order for a few reasons:
	// 1. To ensure that front-heavy ternary conditionals only use a single temp variable
	// 2. So that the condition expression does not accidentally use variable `x`
	// const q = (a: boolean, b: boolean, c: boolean) => { const x = ((a ? b : c) ? (a ? b : c) : a ? b : c) ? b : c; };
	if (declaration) {
		conditionStr = compileTruthyCheck(state, condition);
		if (declaration.needsLocalizing) {
			state.pushPrecedingStatements(node, state.indent + `local ${declaration.set};\n`);
		}

		state.currentConditionalContext = id = declaration.set;
		state.declarationContext.delete(node);
	} else {
		if (currentConditionalContext === "") {
			// console.log("currentTruthyContext", state.currentTruthyContext);
			id = state.pushPrecedingStatementToNewId(node, "");
			state.currentConditionalContext = id;
			isPushed = true;
		} else {
			id = currentConditionalContext;
		}
		conditionStr = compileTruthyCheck(state, condition);
	}

	const subDeclaration = { isIdentifier: declaration ? declaration.isIdentifier : true, set: id } as const;

	state.pushPrecedingStatements(condition, state.indent + `if ${conditionStr} then\n`);
	compileConditionalBlock(state, id, whenTrue, subDeclaration, isInTruthyCheck);
	state.pushPrecedingStatements(whenFalse, state.indent + `else\n`);
	compileConditionalBlock(state, id, whenFalse, subDeclaration, isInTruthyCheck);
	state.pushPrecedingStatements(whenFalse, state.indent + `end;\n`);

	if (currentConditionalContext === "") {
		state.currentConditionalContext = "";
	}
	state.getCurrentPrecedingStatementContext(node).isPushed = isPushed;
	return id;
}

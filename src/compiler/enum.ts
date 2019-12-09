import * as ts from "ts-morph";
import { checkReserved, getReadableExpressionName, sanitizeTemplate } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { safeLuaIndex, skipNodesDownwards } from "../utility/general";
import { shouldHoist } from "../utility/type";

export function compileEnumDeclaration(state: CompilerState, node: ts.EnumDeclaration) {
	let result = "";
	if (node.isConstEnum()) {
		return result;
	}
	const nameNode = node.getNameNode();

	if (nameNode.getDefinitionNodes().some(definition => definition !== node)) {
		throw new CompilerError("Enum merging is not allowed!", node, CompilerErrorType.NoEnumMerging);
	}

	const name = checkReserved(nameNode);
	state.pushExport(name, node);
	if (shouldHoist(node, nameNode)) {
		state.pushHoistStack(name);
	}
	result += state.indent + `local ${name};\n`;
	result += state.indent + `do\n`;
	state.pushIndent();
	state.pushIdStack();
	const inverseId = state.getNewId();
	result += state.indent + `local ${inverseId} = {};\n`;
	result += state.indent + `${name} = setmetatable({}, { __index = ${inverseId} });\n`;
	for (const member of node.getMembers()) {
		const memberName = member.getName();
		const memberValue = member.getValue();
		const safeIndex = safeLuaIndex(name, memberName);
		if (typeof memberValue === "string") {
			const strForm = '"' + sanitizeTemplate(memberValue) + '"';
			result += state.indent + `${safeIndex} = ${strForm};\n`;
		} else if (typeof memberValue === "number") {
			result += state.indent + `${safeIndex} = ${memberValue};\n`;
			result += state.indent + `${inverseId}[${memberValue}] = "${memberName}";\n`;
		} else if (member.hasInitializer()) {
			const initializer = skipNodesDownwards(member.getInitializerOrThrow());
			state.enterPrecedingStatementContext();
			const expStr = getReadableExpressionName(state, initializer);
			result += state.exitPrecedingStatementContextAndJoin();
			result += state.indent + `${safeIndex} = ${expStr};\n`;
			result += state.indent + `${inverseId}[${expStr}] = "${memberName}";\n`;
		} else {
			throw new CompilerError("Unexpected enum structure.", node, CompilerErrorType.BadEnum, true);
		}
	}
	state.popIdStack();
	state.popIndent();
	result += state.indent + `end;\n`;
	return result;
}

import * as ts from "ts-morph";
import { checkReserved, getReadableExpressionName } from ".";
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
	const name = checkReserved(nameNode);
	state.pushExport(name, node);
	if (shouldHoist(node, nameNode)) {
		state.pushHoistStack(name);
	}
	result += state.indent + `${name} = ${name} or {};\n`;
	result += state.indent + `do\n`;
	state.pushIndent();
	for (const member of node.getMembers()) {
		const memberName = member.getName();
		const memberValue = member.getValue();
		const safeIndex = safeLuaIndex(name, memberName);

		if (typeof memberValue === "string") {
			result += state.indent + `${safeIndex} = "${memberValue}";\n`;
		} else if (typeof memberValue === "number") {
			result += state.indent + `${safeIndex} = ${memberValue};\n`;
			result += state.indent + `${name}[${memberValue}] = "${memberName}";\n`;
		} else if (member.hasInitializer()) {
			const initializer = skipNodesDownwards(member.getInitializer()!);
			state.enterPrecedingStatementContext();
			const expStr = getReadableExpressionName(state, initializer);
			result += state.exitPrecedingStatementContextAndJoin();
			result += state.indent + `${safeIndex} = ${expStr};\n`;
			result += state.indent + `${name}[${expStr}] = "${memberName}";\n`;
		} else {
			throw new CompilerError("Unexpected enum structure.", node, CompilerErrorType.BadEnum, true);
		}
	}
	state.popIndent();
	result += state.indent + `end;\n`;
	return result;
}

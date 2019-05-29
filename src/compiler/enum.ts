import ts from "ts-morph";
import { checkReserved } from ".";
import { CompilerState } from "../CompilerState";
import { CompilerError, CompilerErrorType } from "../errors/CompilerError";
import { shouldHoist } from "../typeUtilities";
import { safeLuaIndex } from "../utility";
import { getReadableExpressionName } from "./indexed";

export function compileEnumDeclaration(state: CompilerState, node: ts.EnumDeclaration) {
	let result = "";
	if (node.isConstEnum()) {
		return result;
	}
	const name = node.getName();
	const nameNode = node.getNameNode();
	checkReserved(name, nameNode, true);
	state.pushExport(name, node);
	if (shouldHoist(node, nameNode)) {
		state.pushHoistStack(name);
	}
	result += state.indent + `${name} = ${name} or {};\n`;
	result += state.indent + `do\n`;
	state.pushIndent();
	for (const member of node.getMembers()) {
		const memberName = member.getName();
		checkReserved(memberName, member.getNameNode());
		const memberValue = member.getValue();
		const safeIndex = safeLuaIndex(name, memberName);

		if (typeof memberValue === "string") {
			result += state.indent + `${safeIndex} = "${memberValue}";\n`;
		} else if (typeof memberValue === "number") {
			result += state.indent + `${safeIndex} = ${memberValue};\n`;
			result += state.indent + `${name}[${memberValue}] = "${memberName}";\n`;
		} else if (member.hasInitializer()) {
			const initializer = member.getInitializer()!;
			state.enterPrecedingStatementContext();
			const expStr = getReadableExpressionName(state, initializer);
			result += state.exitPrecedingStatementContextAndJoin();
			result += state.indent + `${safeIndex} = ${expStr};\n`;
			result += state.indent + `${name}[${expStr}] = "${memberName}";\n`;
		} else {
			throw new CompilerError(
				"You discovered a new kind of enum declaration!" +
					" Please submit an issue at https://github.com/roblox-ts/roblox-ts/issues",
				node,
				CompilerErrorType.BadEnum,
			);
		}
	}
	state.popIndent();
	result += state.indent + `end;\n`;
	return result;
}

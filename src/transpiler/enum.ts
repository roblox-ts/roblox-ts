import * as ts from "ts-morph";
import { checkReserved } from ".";
import { TranspilerState } from "../TranspilerState";
import { safeLuaIndex } from "../utility";

export function transpileEnumDeclaration(state: TranspilerState, node: ts.EnumDeclaration) {
	let result = "";
	if (node.isConstEnum()) {
		return result;
	}
	const name = node.getName();
	checkReserved(name, node.getNameNode());
	state.pushExport(name, node);
	state.pushHoistStack(name);
	result += state.indent + `${name} = ${name} or {};\n`;
	result += state.indent + `do\n`;
	state.pushIndent();
	let last = 0;
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
			last = memberValue + 1;
		} else {
			result += state.indent + `${safeIndex} = ${last};\n`;
			result += state.indent + `${name}[${last}] = "${memberName}";\n`;
			last++;
		}
	}
	state.popIndent();
	result += state.indent + `end\n`;
	return result;
}

import * as lua from "LuaAST";

export class TransformState {
	public readonly prereqStatementsStack = new Array<lua.List<lua.Statement>>();

	public addPrereqStatement(statement: lua.Statement) {
		const prereqStatements = this.prereqStatementsStack[this.prereqStatementsStack.length - 1];
		if (prereqStatements === undefined) {
			throw "???";
		}
		lua.list.push(prereqStatements, statement);
	}
}

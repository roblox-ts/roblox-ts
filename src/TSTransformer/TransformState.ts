import * as lua from "LuaAST";
import ts from "typescript";

export class TransformState {
	public readonly prereqStatementsStack = new Array<lua.List<lua.Statement>>();

	public prereq(statement: lua.Statement) {
		const prereqStatements = this.prereqStatementsStack[this.prereqStatementsStack.length - 1];
		if (prereqStatements === undefined) {
			throw "???";
		}
		lua.list.push(prereqStatements, statement);
	}

	public pushPrereqStatementsStack() {
		const prereqStatements = lua.list.make<lua.Statement>();
		this.prereqStatementsStack.push(prereqStatements);
		return prereqStatements;
	}

	public popPrereqStatementsStack() {
		const poppedValue = this.prereqStatementsStack.pop();
		if (poppedValue === undefined) {
			throw "???";
		}
		return poppedValue;
	}

	/**
	 * Used to create a "synthetic" `lua.Statement`
	 *
	 * This could be:
	 * - a `lua.Statement` that does not come from a `ts.Statement` AND contains transformations from `ts.Expression`s
	 * - a `ts.Statement` that transforms into multiple `lua.Statement`s
	 *
	 * This function will:
	 * - push prereqStatementsStack
	 * - call `callback`
	 * - pop prereqStatementsStack
	 * - return prereq statements
	 */
	public statement(callback: (statements: lua.List<lua.Statement>) => void) {
		const statements = this.pushPrereqStatementsStack();
		callback(statements);
		return this.popPrereqStatementsStack();
	}
}

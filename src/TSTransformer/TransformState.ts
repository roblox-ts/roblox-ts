import * as lua from "LuaAST";
import ts from "typescript";

export class TransformState {
	constructor(public readonly typeChecker: ts.TypeChecker) {}

	public readonly prereqStatementsStack = new Array<lua.List<lua.Statement>>();

	public prereq(statement: lua.Statement) {
		lua.list.push(this.prereqStatementsStack[this.prereqStatementsStack.length - 1], statement);
	}

	public prereqList(statements: lua.List<lua.Statement>) {
		lua.list.pushList(this.prereqStatementsStack[this.prereqStatementsStack.length - 1], statements);
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

	public capturePrereqs(callback: () => lua.Expression) {
		let expression!: lua.Expression;
		const statements = this.statement(() => (expression = callback()));
		return { expression, statements };
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

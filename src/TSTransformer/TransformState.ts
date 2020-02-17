import * as lua from "LuaAST";
import * as tsst from "ts-simple-type";
import ts from "typescript";

export class TransformState {
	private readonly sourceFileText: string;

	public readonly diagnostics = new Array<ts.Diagnostic>();

	public addDiagnostic(diagnostic: ts.Diagnostic) {
		this.diagnostics.push(diagnostic);
	}

	constructor(public readonly typeChecker: ts.TypeChecker, sourceFile: ts.SourceFile) {
		this.sourceFileText = sourceFile.getFullText();
	}

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

	public getLeadingComments(node: ts.Node) {
		const commentRanges = ts.getLeadingCommentRanges(this.sourceFileText, node.pos) ?? [];
		return commentRanges
			.filter(commentRange => commentRange.kind === ts.SyntaxKind.SingleLineCommentTrivia)
			.map(commentRange => this.sourceFileText.substring(commentRange.pos + 2, commentRange.end));
	}

	public getSimpleType(node: ts.Node) {
		return tsst.toSimpleType(this.typeChecker.getTypeAtLocation(node), this.typeChecker);
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

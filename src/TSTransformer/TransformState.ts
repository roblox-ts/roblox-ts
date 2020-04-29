import ts from "byots";
import * as lua from "LuaAST";
import { assert } from "Shared/util/assert";
import * as tsst from "ts-simple-type";
import { CompileState, MacroManager } from "TSTransformer";
import { skipUpwards } from "TSTransformer/util/skipUpwards";
import originalTS from "typescript";

export class TransformState {
	private readonly sourceFileText: string;

	// TODO: actually look up from package.json
	public readonly projectVersion = "0.0.0";

	public readonly diagnostics = new Array<ts.Diagnostic>();

	public addDiagnostic(diagnostic: ts.Diagnostic) {
		this.diagnostics.push(diagnostic);
	}

	constructor(
		public readonly compileState: CompileState,
		public readonly typeChecker: ts.TypeChecker,
		public readonly macroManager: MacroManager,
		sourceFile: ts.SourceFile,
	) {
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
		assert(poppedValue);
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

	public getSimpleType(type: ts.Type) {
		return tsst.toSimpleType(type as originalTS.Type, this.typeChecker as originalTS.TypeChecker);
	}

	public getSimpleTypeFromNode(node: ts.Node) {
		return this.getSimpleType(this.getType(node));
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
	public statement(callback: () => void) {
		this.pushPrereqStatementsStack();
		callback();
		return this.popPrereqStatementsStack();
	}

	public readonly hoistsByStatement = new Map<ts.Statement, Array<ts.Identifier>>();
	public readonly isHoisted = new Map<ts.Symbol, boolean>();

	public getType(node: ts.Node) {
		return this.typeChecker.getTypeAtLocation(skipUpwards(node));
	}
}

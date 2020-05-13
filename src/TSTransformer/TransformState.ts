import ts from "byots";
import * as lua from "LuaAST";
import { PathTranslator } from "Shared/PathTranslator";
import { RbxPath, RojoConfig } from "Shared/RojoConfig";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import * as tsst from "ts-simple-type";
import { CompileState, MacroManager } from "TSTransformer";
import { createGetService } from "TSTransformer/util/createGetService";
import { getModuleAncestor, skipUpwards } from "TSTransformer/util/traversal";
import originalTS from "typescript";

const RUNTIME_LIB_ID = lua.id("TS");

export class TransformState {
	private readonly sourceFileText: string;
	public readonly diagnostics = new Array<ts.Diagnostic>();
	public hasExports = false;
	public hasExportEquals = false;

	public addDiagnostic(diagnostic: ts.Diagnostic) {
		this.diagnostics.push(diagnostic);
	}

	constructor(
		public readonly compileState: CompileState,
		public readonly rojoConfig: RojoConfig,
		public readonly pathTranslator: PathTranslator,
		public readonly runtimeLibRbxPath: RbxPath,
		public readonly typeChecker: ts.TypeChecker,
		public readonly macroManager: MacroManager,
		public readonly sourceFile: ts.SourceFile,
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
	 * Returns the prerequisite statements created by `callback`
	 */
	public capturePrereqs(callback: () => void) {
		this.pushPrereqStatementsStack();
		callback();
		return this.popPrereqStatementsStack();
	}

	/**
	 * Returns the expression and prerequisite statements created by `callback`
	 */
	public capture(callback: () => lua.Expression) {
		let expression!: lua.Expression;
		const statements = this.capturePrereqs(() => (expression = callback()));
		return { expression, statements };
	}

	public noPrereqs(callback: () => lua.Expression) {
		let expression!: lua.Expression;
		const statements = this.capturePrereqs(() => (expression = callback()));
		assert(lua.list.isEmpty(statements));
		return expression;
	}

	public readonly hoistsByStatement = new Map<ts.Statement | ts.CaseClause, Array<ts.Identifier>>();
	public readonly isHoisted = new Map<ts.Symbol, boolean>();

	public getType(node: ts.Node) {
		return this.typeChecker.getTypeAtLocation(skipUpwards(node));
	}

	public usesRuntimeLib = false;
	public TS(name: string) {
		this.usesRuntimeLib = true;
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: RUNTIME_LIB_ID,
			name,
		});
	}

	public createRuntimeLibImport() {
		const rbxPath = [...this.runtimeLibRbxPath];
		const serviceName = rbxPath.shift();
		assert(serviceName);

		let expression: lua.IndexableExpression = createGetService(serviceName);
		for (const pathPart of rbxPath) {
			expression = lua.create(lua.SyntaxKind.MethodCallExpression, {
				expression,
				name: "WaitForChild",
				args: lua.list.make(lua.string(pathPart)),
			});
		}

		expression = lua.create(lua.SyntaxKind.CallExpression, {
			expression: lua.globals.require,
			args: lua.list.make(expression),
		});

		return lua.create(lua.SyntaxKind.VariableDeclaration, {
			left: RUNTIME_LIB_ID,
			right: expression,
		});
	}

	public pushToVar(expression: lua.Expression) {
		const temp = lua.tempId();
		this.prereq(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: temp,
				right: expression,
			}),
		);
		return temp;
	}

	public pushToVarIfComplex<T extends lua.Expression>(
		expression: T,
	): Extract<T, lua.SimpleTypes> | lua.TemporaryIdentifier {
		if (lua.isSimple(expression)) {
			return expression as Extract<T, lua.SimpleTypes>;
		}
		return this.pushToVar(expression);
	}

	private getModuleExportsAliasMap(moduleSymbol: ts.Symbol) {
		return getOrSetDefault(this.compileState.getModuleExportsAliasMapCache, moduleSymbol, () => {
			const aliasMap = new Map<ts.Symbol, string>();
			for (const symbol of this.typeChecker.getExportsOfModule(moduleSymbol)) {
				const declaration = symbol.getDeclarations()?.[0];
				assert(declaration && ts.isExportSpecifier(declaration));
				aliasMap.set(ts.skipAlias(symbol, this.typeChecker), declaration.name.text);
			}
			return aliasMap;
		});
	}

	private getModuleSymbolFromNode(node: ts.Node) {
		const exportSymbol = this.typeChecker.getSymbolAtLocation(getModuleAncestor(node));
		assert(exportSymbol);
		return exportSymbol;
	}

	private readonly moduleIdBySymbol = new Map<ts.Symbol, lua.Identifier>();

	private getModuleIdFromSymbol(moduleSymbol: ts.Symbol) {
		const moduleId = this.moduleIdBySymbol.get(moduleSymbol);
		assert(moduleId);
		return moduleId;
	}

	public setModuleIdBySymbol(moduleSymbol: ts.Symbol, moduleId: lua.Identifier) {
		this.moduleIdBySymbol.set(moduleSymbol, moduleId);
	}

	public getModuleIdFromNode(node: ts.Node) {
		const moduleSymbol = this.getModuleSymbolFromNode(node);
		return this.getModuleIdFromSymbol(moduleSymbol);
	}

	public getModuleIdPropertyAccess(idSymbol: ts.Symbol, identifier: ts.Identifier) {
		const moduleSymbol = this.getModuleSymbolFromNode(idSymbol.valueDeclaration);
		const moduleId = this.getModuleIdFromSymbol(moduleSymbol);
		const alias = this.getModuleExportsAliasMap(moduleSymbol).get(idSymbol);
		if (alias) {
			return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
				expression: moduleId,
				name: alias,
			});
		}
	}
}

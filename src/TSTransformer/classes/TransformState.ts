import ts from "byots";
import * as lua from "LuaAST";
import { PathTranslator } from "Shared/classes/PathTranslator";
import { RbxPath, RojoConfig } from "Shared/classes/RojoConfig";
import { ProjectType } from "Shared/constants";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import * as tsst from "ts-simple-type";
import { GlobalSymbols, MacroManager, MultiTransformState, RoactSymbolManager } from "TSTransformer";
import { createGetService } from "TSTransformer/util/createGetService";
import { getModuleAncestor, skipUpwards } from "TSTransformer/util/traversal";
import originalTS from "typescript";

/**
 * The ID of the Runtime library.
 */
const RUNTIME_LIB_ID = lua.id("TS");

export type TryUses = {
	usesReturn: boolean;
	usesBreak: boolean;
	usesContinue: boolean;
};

/**
 * Represents the state of the transformation between TS -> lua AST.
 */
export class TransformState {
	private readonly sourceFileText: string;
	public readonly diagnostics = new Array<ts.Diagnostic>();
	public hasExportEquals = false;
	public hasExportFrom = false;

	public addDiagnostic(diagnostic: ts.Diagnostic) {
		this.diagnostics.push(diagnostic);
	}

	constructor(
		public readonly compilerOptions: ts.CompilerOptions,
		public readonly multiTransformState: MultiTransformState,
		public readonly rojoConfig: RojoConfig,
		public readonly pathTranslator: PathTranslator,
		public readonly runtimeLibRbxPath: RbxPath | undefined,
		public readonly nodeModulesPath: string,
		public readonly nodeModulesRbxPath: RbxPath | undefined,
		public readonly nodeModulesPathMapping: Map<string, string>,
		public readonly typeChecker: ts.TypeChecker,
		public readonly resolver: ts.EmitResolver,
		public readonly globalSymbols: GlobalSymbols,
		public readonly macroManager: MacroManager,
		public readonly roactSymbolManager: RoactSymbolManager | undefined,
		public readonly projectType: ProjectType,
		public readonly pkgVersion: string | undefined,
		public readonly sourceFile: ts.SourceFile,
	) {
		this.sourceFileText = sourceFile.getFullText();
	}

	public readonly tryUsesStack = new Array<TryUses>();

	/**
	 * Pushes tryUses information onto the tryUses stack and returns it.
	 */
	public pushTryUsesStack() {
		const tryUses = {
			usesReturn: false,
			usesBreak: false,
			usesContinue: false,
		};
		this.tryUsesStack.push(tryUses);
		return tryUses;
	}

	/**
	 * Marks the current try statement as exiting with return, break, or continue statements.
	 */
	public markTryUses(property: keyof TryUses) {
		if (this.tryUsesStack.length !== 0) {
			this.tryUsesStack[this.tryUsesStack.length - 1][property] = true;
		}
	}

	/**
	 * Pops tryUses information from the tryUses stack
	 */
	public popTryUsesStack() {
		this.tryUsesStack.pop();
	}

	public readonly prereqStatementsStack = new Array<lua.List<lua.Statement>>();

	/**
	 * Pushes a new prerequisite statement onto the list stack.
	 * @param statement
	 */
	public prereq(statement: lua.Statement) {
		lua.list.push(this.prereqStatementsStack[this.prereqStatementsStack.length - 1], statement);
	}

	/**
	 * Pushes a new prerequisite list of statement onto the list stack.
	 * @param statements
	 */
	public prereqList(statements: lua.List<lua.Statement>) {
		lua.list.pushList(this.prereqStatementsStack[this.prereqStatementsStack.length - 1], statements);
	}

	/**
	 * Creates and pushes a new list of `lua.Statement`s onto the prerequisite stack.
	 */
	public pushPrereqStatementsStack() {
		const prereqStatements = lua.list.make<lua.Statement>();
		this.prereqStatementsStack.push(prereqStatements);
		return prereqStatements;
	}

	/**
	 * Pops and returns the top item of the prerequisite stack.
	 */
	public popPrereqStatementsStack() {
		const poppedValue = this.prereqStatementsStack.pop();
		assert(poppedValue);
		return poppedValue;
	}

	/**
	 * Returns the leading comments of a `ts.Node` as an array of strings.
	 * @param node
	 */
	public getLeadingComments(node: ts.Node) {
		const commentRanges = ts.getLeadingCommentRanges(this.sourceFileText, node.pos) ?? [];
		return (
			commentRanges
				// filter out non-`ts.SyntaxKind.SingleLineCommentTrivia`
				.filter(commentRange => commentRange.kind === ts.SyntaxKind.SingleLineCommentTrivia)
				// map each `ts.CommentRange` to its value without the beginning '//'
				.map(commentRange => this.sourceFileText.substring(commentRange.pos + 2, commentRange.end))
		);
	}

	/**
	 * Converts a TypeScript type into a "SimpleType"
	 * @param type The type to convert.
	 */
	public getSimpleType(type: ts.Type) {
		return tsst.toSimpleType(type as originalTS.Type, this.typeChecker as originalTS.TypeChecker);
	}

	/**
	 * Converts the TypeScript type of `node` into a "SimpleType"
	 * @param node The node with the type to convert.
	 */
	public getSimpleTypeFromNode(node: ts.Node) {
		return this.getSimpleType(this.getType(node));
	}

	/**
	 * Returns the prerequisite statements created by `callback`.
	 */
	public capturePrereqs(callback: () => void) {
		this.pushPrereqStatementsStack();
		callback();
		return this.popPrereqStatementsStack();
	}

	/**
	 * Returns the expression and prerequisite statements created by `callback`.
	 */
	public capture(callback: () => lua.Expression) {
		let expression!: lua.Expression;
		const statements = this.capturePrereqs(() => (expression = callback()));
		return { expression, statements };
	}

	/**
	 *
	 * @param callback
	 */
	public noPrereqs(callback: () => lua.Expression) {
		let expression!: lua.Expression;
		const statements = this.capturePrereqs(() => (expression = callback()));
		assert(lua.list.isEmpty(statements));
		return expression;
	}

	public readonly hoistsByStatement = new Map<ts.Statement | ts.CaseClause, Array<ts.Identifier>>();
	public readonly isHoisted = new Map<ts.Symbol, boolean>();

	private getTypeCache = new Map<ts.Node, ts.Type>();
	public getType(node: ts.Node) {
		return getOrSetDefault(this.getTypeCache, node, () => this.typeChecker.getTypeAtLocation(skipUpwards(node)));
	}

	public usesRuntimeLib = false;
	public TS(name: string) {
		this.usesRuntimeLib = true;
		return lua.create(lua.SyntaxKind.PropertyAccessExpression, {
			expression: RUNTIME_LIB_ID,
			name,
		});
	}

	/**
	 * Returns a `lua.VariableDeclaration` for RuntimeLib.lua
	 */
	public createRuntimeLibImport() {
		// if the transform state has the game path to the RuntimeLib.lua
		if (this.runtimeLibRbxPath) {
			const rbxPath = [...this.runtimeLibRbxPath];
			// create an expression to obtain the service where RuntimeLib is stored
			const serviceName = rbxPath.shift();
			assert(serviceName);

			let expression: lua.IndexableExpression = createGetService(serviceName);
			// iterate through the rest of the path
			// for each instance in the path, create a new WaitForChild call to be added on to the end of the final expression
			for (const pathPart of rbxPath) {
				expression = lua.create(lua.SyntaxKind.MethodCallExpression, {
					expression,
					name: "WaitForChild",
					args: lua.list.make(lua.string(pathPart)),
				});
			}

			// nest the chain of `WaitForChild`s inside a require call
			expression = lua.create(lua.SyntaxKind.CallExpression, {
				expression: lua.globals.require,
				args: lua.list.make(expression),
			});

			// create a variable declaration for this call
			return lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: RUNTIME_LIB_ID,
				right: expression,
			});
		} else {
			// we pass RuntimeLib access to packages via `_G[script] = TS`
			// access it here via `local TS = _G[script]`
			return lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: RUNTIME_LIB_ID,
				right: lua.create(lua.SyntaxKind.ComputedIndexExpression, {
					expression: lua.globals._G,
					index: lua.globals.script,
				}),
			});
		}
	}

	/**
	 * Declares and defines a new lua variable. Pushes that new variable to a new lua.TemporaryIdentifier.
	 * Can also be used to initialise a new tempId without a value
	 * @param expression
	 */
	public pushToVar(expression: lua.Expression | undefined) {
		const temp = lua.tempId();
		this.prereq(
			lua.create(lua.SyntaxKind.VariableDeclaration, {
				left: temp,
				right: expression,
			}),
		);
		return temp;
	}

	/**
	 * Uses `state.pushToVar(expression)` unless `lua.isSimple(expression)`
	 * @param expression the expression to push
	 */
	public pushToVarIfComplex<T extends lua.Expression>(
		expression: T,
	): Extract<T, lua.SimpleTypes> | lua.TemporaryIdentifier {
		if (lua.isSimple(expression)) {
			return expression as Extract<T, lua.SimpleTypes>;
		}
		return this.pushToVar(expression);
	}

	/**
	 * Uses `state.pushToVar(expression)` unless `lua.isAnyIdentifier(expression)`
	 * @param expression the expression to push
	 */
	public pushToVarIfNonId<T extends lua.Expression>(
		expression: T,
	): Extract<T, lua.SimpleTypes> | lua.TemporaryIdentifier {
		if (lua.isAnyIdentifier(expression)) {
			return expression as Extract<T, lua.SimpleTypes>;
		}
		return this.pushToVar(expression);
	}

	/**
	 *
	 * @param moduleSymbol
	 */
	public getModuleExports(moduleSymbol: ts.Symbol) {
		return getOrSetDefault(this.multiTransformState.getModuleExportsCache, moduleSymbol, () =>
			this.typeChecker.getExportsOfModule(moduleSymbol),
		);
	}

	/**
	 *
	 * @param moduleSymbol
	 */
	public getModuleExportsAliasMap(moduleSymbol: ts.Symbol) {
		return getOrSetDefault(this.multiTransformState.getModuleExportsAliasMapCache, moduleSymbol, () => {
			const aliasMap = new Map<ts.Symbol, string>();
			for (const exportSymbol of this.getModuleExports(moduleSymbol)) {
				const originalSymbol = ts.skipAlias(exportSymbol, this.typeChecker);
				const declaration = exportSymbol.getDeclarations()?.[0];
				if (declaration && ts.isExportSpecifier(declaration)) {
					aliasMap.set(originalSymbol, declaration.name.text);
				} else {
					aliasMap.set(originalSymbol, exportSymbol.name);
				}
			}
			return aliasMap;
		});
	}

	private getModuleSymbolFromNode(node: ts.Node) {
		const moduleAncestor = getModuleAncestor(node);
		const exportSymbol = this.typeChecker.getSymbolAtLocation(
			ts.isSourceFile(moduleAncestor) ? moduleAncestor : moduleAncestor.name,
		);
		assert(exportSymbol);
		return exportSymbol;
	}

	private readonly moduleIdBySymbol = new Map<ts.Symbol, lua.AnyIdentifier>();

	private getModuleIdFromSymbol(moduleSymbol: ts.Symbol) {
		const moduleId = this.moduleIdBySymbol.get(moduleSymbol);
		assert(moduleId);
		return moduleId;
	}

	/**
	 *
	 * @param moduleSymbol
	 * @param moduleId
	 */
	public setModuleIdBySymbol(moduleSymbol: ts.Symbol, moduleId: lua.AnyIdentifier) {
		this.moduleIdBySymbol.set(moduleSymbol, moduleId);
	}

	/**
	 *
	 * @param node
	 */
	public getModuleIdFromNode(node: ts.Node) {
		const moduleSymbol = this.getModuleSymbolFromNode(node);
		return this.getModuleIdFromSymbol(moduleSymbol);
	}

	/**
	 *
	 * @param idSymbol
	 * @param identifier
	 */
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

import luau, { render, RenderState, renderStatements, solveTempIds } from "@roblox-ts/luau-ast";
import { PathTranslator } from "@roblox-ts/path-translator";
import { RbxPath, RbxPathParent, RojoResolver } from "@roblox-ts/rojo-resolver";
import path from "path";
import { PARENT_FIELD, ProjectType } from "Shared/constants";
import { errors, warnings } from "Shared/diagnostics";
import { ProjectData } from "Shared/types";
import { assert } from "Shared/util/assert";
import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import { MultiTransformState } from "TSTransformer";
import { DiagnosticService } from "TSTransformer/classes/DiagnosticService";
import { TransformServices, TryUses } from "TSTransformer/types";
import { createGetService } from "TSTransformer/util/createGetService";
import { propertyAccessExpressionChain } from "TSTransformer/util/expressionChain";
import { getModuleAncestor, skipUpwards } from "TSTransformer/util/traversal";
import { valueToIdStr } from "TSTransformer/util/valueToIdStr";
import ts from "typescript";

/**
 * Represents the state of the transformation between TS -> Luau AST.
 */
export class TransformState {
	private readonly sourceFileText: string;
	public hasExportEquals = false;
	public hasExportFrom = false;

	public classIdentifierMap = new Map<ts.ClassLikeDeclaration, luau.AnyIdentifier>();

	public debugRender(node: luau.Node) {
		const state = new RenderState();
		solveTempIds(state, node);
		return render(state, node);
	}

	public debugRenderList(list: luau.List<luau.Statement>) {
		const state = new RenderState();
		solveTempIds(state, list);
		return renderStatements(state, list);
	}

	public readonly resolver: ts.EmitResolver;
	private isInReplicatedFirst: boolean;

	constructor(
		public readonly program: ts.Program,
		public readonly data: ProjectData,
		public readonly services: TransformServices,
		public readonly pathTranslator: PathTranslator,
		public readonly multiTransformState: MultiTransformState,
		public readonly compilerOptions: ts.CompilerOptions,
		public readonly rojoResolver: RojoResolver,
		public readonly pkgRojoResolvers: Array<RojoResolver>,
		public readonly nodeModulesPathMapping: Map<string, string>,
		public readonly runtimeLibRbxPath: RbxPath | undefined,
		public readonly typeChecker: ts.TypeChecker,
		public readonly projectType: ProjectType,
		sourceFile: ts.SourceFile,
	) {
		this.sourceFileText = sourceFile.getFullText();
		this.resolver = typeChecker.getEmitResolver(sourceFile);

		const sourceOutPath = this.pathTranslator.getOutputPath(sourceFile.fileName);
		const rbxPath = this.rojoResolver.getRbxPathFromFilePath(sourceOutPath);
		this.isInReplicatedFirst = rbxPath !== undefined && rbxPath[0] === "ReplicatedFirst";
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

	public readonly prereqStatementsStack = new Array<luau.List<luau.Statement>>();

	/**
	 * Pushes a new prerequisite statement onto the list stack.
	 * @param statement
	 */
	public prereq(statement: luau.Statement) {
		luau.list.push(this.prereqStatementsStack[this.prereqStatementsStack.length - 1], statement);
	}

	/**
	 * Pushes a new prerequisite list of statement onto the list stack.
	 * @param statements
	 */
	public prereqList(statements: luau.List<luau.Statement>) {
		luau.list.pushList(this.prereqStatementsStack[this.prereqStatementsStack.length - 1], statements);
	}

	/**
	 * Creates and pushes a new list of `luau.Statement`s onto the prerequisite stack.
	 */
	public pushPrereqStatementsStack() {
		const prereqStatements = luau.list.make<luau.Statement>();
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
		return luau.list.make(
			...commentRanges.map(commentRange =>
				luau.comment(
					this.sourceFileText.substring(
						commentRange.pos + 2,
						commentRange.kind === ts.SyntaxKind.SingleLineCommentTrivia
							? commentRange.end
							: commentRange.end - 2,
					),
				),
			),
		);
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
	 * Returns the result and prerequisite statements created by `callback`.
	 */
	public capture<T>(callback: () => T): [value: T, prereqs: luau.List<luau.Statement>] {
		let value!: T;
		const prereqs = this.capturePrereqs(() => (value = callback()));
		return [value, prereqs];
	}

	public noPrereqs(callback: () => luau.Expression) {
		let expression!: luau.Expression;
		const statements = this.capturePrereqs(() => (expression = callback()));
		assert(luau.list.isEmpty(statements));
		return expression;
	}

	public readonly hoistsByStatement = new Map<ts.Statement | ts.CaseClause, Array<ts.Identifier>>();
	public readonly isHoisted = new Map<ts.Symbol, boolean>();

	private getTypeCache = new Map<ts.Node, ts.Type>();
	public getType(node: ts.Node) {
		return getOrSetDefault(this.getTypeCache, node, () => this.typeChecker.getTypeAtLocation(skipUpwards(node)));
	}

	public usesRuntimeLib = false;
	public TS(node: ts.Node, name: string) {
		this.usesRuntimeLib = true;

		if (this.projectType === ProjectType.Game && this.isInReplicatedFirst) {
			DiagnosticService.addDiagnostic(warnings.runtimeLibUsedInReplicatedFirst(node));
		}

		return luau.property(luau.globals.TS, name);
	}

	/**
	 * Returns a `luau.VariableDeclaration` for RuntimeLib.lua
	 */
	public createRuntimeLibImport(sourceFile: ts.SourceFile) {
		// if the transform state has the game path to the RuntimeLib.lua
		if (this.runtimeLibRbxPath) {
			if (this.projectType === ProjectType.Game) {
				// create an expression to obtain the service where RuntimeLib is stored
				const serviceName = this.runtimeLibRbxPath[0];
				assert(serviceName);

				let expression: luau.IndexableExpression = createGetService(serviceName);
				// iterate through the rest of the path
				// for each instance in the path, create a new WaitForChild call to be added on to the end of the final expression
				for (let i = 1; i < this.runtimeLibRbxPath.length; i++) {
					expression = luau.create(luau.SyntaxKind.MethodCallExpression, {
						expression,
						name: "WaitForChild",
						args: luau.list.make(luau.string(this.runtimeLibRbxPath[i])),
					});
				}

				// nest the chain of `WaitForChild`s inside a require call
				expression = luau.call(luau.globals.require, [expression]);

				// create a variable declaration for this call
				return luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: luau.globals.TS,
					right: expression,
				});
			} else {
				const sourceOutPath = this.pathTranslator.getOutputPath(sourceFile.fileName);
				const rbxPath = this.rojoResolver.getRbxPathFromFilePath(sourceOutPath);
				if (!rbxPath) {
					DiagnosticService.addDiagnostic(
						errors.noRojoData(sourceFile, path.relative(this.data.projectPath, sourceOutPath), false),
					);
					return luau.create(luau.SyntaxKind.VariableDeclaration, {
						left: luau.globals.TS,
						right: luau.none(),
					});
				}

				return luau.create(luau.SyntaxKind.VariableDeclaration, {
					left: luau.globals.TS,
					right: luau.call(luau.globals.require, [
						propertyAccessExpressionChain(
							luau.globals.script,
							RojoResolver.relative(rbxPath, this.runtimeLibRbxPath).map(v =>
								v === RbxPathParent ? PARENT_FIELD : v,
							),
						),
					]),
				});
			}
		} else {
			// we pass RuntimeLib access to packages via `_G[script] = TS`
			// access it here via `local TS = _G[script]`
			return luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: luau.globals.TS,
				right: luau.create(luau.SyntaxKind.ComputedIndexExpression, {
					expression: luau.globals._G,
					index: luau.globals.script,
				}),
			});
		}
	}

	/**
	 * Declares and defines a new Luau variable. Pushes that new variable to a new luau.TemporaryIdentifier.
	 * Can also be used to initialise a new tempId without a value
	 * @param expression
	 */
	public pushToVar(expression: luau.Expression | undefined, name?: string) {
		const temp = luau.tempId(name || (expression && valueToIdStr(expression)));
		this.prereq(
			luau.create(luau.SyntaxKind.VariableDeclaration, {
				left: temp,
				right: expression,
			}),
		);
		return temp;
	}

	/**
	 * Uses `state.pushToVar(expression)` unless `luau.isSimple(expression)`
	 * @param expression the expression to push
	 */
	public pushToVarIfComplex<T extends luau.Expression>(
		expression: T,
		name?: string,
	): Extract<T, luau.SimpleTypes> | luau.TemporaryIdentifier {
		if (luau.isSimple(expression)) {
			return expression as Extract<T, luau.SimpleTypes>;
		}
		return this.pushToVar(expression, name);
	}

	/**
	 * Uses `state.pushToVar(expression)` unless `luau.isAnyIdentifier(expression)`
	 * @param expression the expression to push
	 */
	public pushToVarIfNonId<T extends luau.Expression>(expression: T, name?: string): luau.AnyIdentifier {
		if (luau.isAnyIdentifier(expression)) {
			return expression;
		}
		return this.pushToVar(expression, name);
	}

	public getModuleExports(moduleSymbol: ts.Symbol) {
		return getOrSetDefault(this.multiTransformState.getModuleExportsCache, moduleSymbol, () =>
			this.typeChecker.getExportsOfModule(moduleSymbol),
		);
	}

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

	private readonly moduleIdBySymbol = new Map<ts.Symbol, luau.AnyIdentifier>();

	private getModuleIdFromSymbol(moduleSymbol: ts.Symbol) {
		const moduleId = this.moduleIdBySymbol.get(moduleSymbol);
		assert(moduleId);
		return moduleId;
	}

	public setModuleIdBySymbol(moduleSymbol: ts.Symbol, moduleId: luau.AnyIdentifier) {
		this.moduleIdBySymbol.set(moduleSymbol, moduleId);
	}

	public getModuleIdFromNode(node: ts.Node) {
		const moduleSymbol = this.getModuleSymbolFromNode(node);
		return this.getModuleIdFromSymbol(moduleSymbol);
	}

	public getModuleIdPropertyAccess(idSymbol: ts.Symbol) {
		if (idSymbol.valueDeclaration) {
			const moduleSymbol = this.getModuleSymbolFromNode(idSymbol.valueDeclaration);
			const alias = this.getModuleExportsAliasMap(moduleSymbol).get(idSymbol);
			if (alias) {
				return luau.property(this.getModuleIdFromSymbol(moduleSymbol), alias);
			}
		}
	}

	/** attempts to reverse symlink lookup */
	public guessVirtualPath(fsPath: string) {
		const reverseSymlinkMap = this.program.getSymlinkCache?.().getSymlinkedDirectoriesByRealpath();
		if (!reverseSymlinkMap) return;

		const original = fsPath;
		while (true) {
			// reverseSymlinkMap always has trailing slashes
			// as it is constructed from `SymlinkedDirectory.real`
			const parent = ts.ensureTrailingDirectorySeparator(path.dirname(fsPath));
			if (fsPath === parent) break;
			fsPath = parent;
			const symlink = reverseSymlinkMap.get(
				ts.toPath(fsPath, this.program.getCurrentDirectory(), getCanonicalFileName),
			)?.[0];
			if (symlink) {
				return path.join(symlink, path.relative(fsPath, original));
			}
		}
	}

	public symbolToIdMap = new Map<ts.Symbol, luau.TemporaryIdentifier>();

	// stores a mapping of `key` in `obj[key] = value` for classes so that the `key` can be referred to later
	private classElementToObjectKeyMap = new Map<ts.ClassElement, luau.SimpleTypes>();

	public setClassElementObjectKey(classElement: ts.ClassElement, identifier: luau.SimpleTypes) {
		assert(!this.classElementToObjectKeyMap.has(classElement));
		this.classElementToObjectKeyMap.set(classElement, identifier);
	}

	public getClassElementObjectKey(classElement: ts.ClassElement) {
		return this.classElementToObjectKeyMap.get(classElement);
	}
}

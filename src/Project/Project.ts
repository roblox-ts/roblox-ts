import ts from "byots";
import fs from "fs-extra";
import { renderAST } from "LuaRenderer";
import path from "path";
import { createParseConfigFileHost } from "Project/util/createParseConfigFileHost";
import { createReadBuildProgramHost } from "Project/util/createReadBuildProgramHost";
import { validateCompilerOptions } from "Project/util/validateCompilerOptions";
import { ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
import { cleanupDirRecursively } from "Shared/fsUtil";
import { PathTranslator } from "Shared/PathTranslator";
import { NetworkType, RbxPath, RojoConfig } from "Shared/RojoConfig";
import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import {
	GlobalSymbols,
	MacroManager,
	MultiTransformState,
	RoactSymbolManager,
	transformSourceFile,
	TransformState,
} from "TSTransformer";
import { fileIsModule } from "TSTransformer/preEmitDiagnostics/fileIsModule";

export type PreEmitChecker = (sourceFile: ts.SourceFile) => Array<ts.Diagnostic>;
const preEmitDiagnostics: Array<PreEmitChecker> = [fileIsModule];

const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "include",
	rojo: "",
};

/**
 * The options of the project.
 */
export interface ProjectOptions {
	/**
	 * The path to the include directory.
	 */
	includePath: string;

	/**
	 * The path to the rojo configuration.
	 */
	rojo: string;
}

/**
 * Represents a roblox-ts project.
 */
export class Project {
	public readonly projectPath: string;
	public readonly nodeModulesPath: string;
	public readonly rootDir: string;
	public readonly outDir: string;
	public readonly rojoFilePath: string | undefined;

	private readonly program: ts.EmitAndSemanticDiagnosticsBuilderProgram;
	private readonly compilerOptions: ts.CompilerOptions;
	private readonly typeChecker: ts.TypeChecker;
	private readonly projectOptions: ProjectOptions;
	private readonly globalSymbols: GlobalSymbols;
	private readonly macroManager: MacroManager;
	private readonly roactSymbolManager: RoactSymbolManager | undefined;
	private readonly rojoConfig: RojoConfig;
	private readonly pathTranslator: PathTranslator;
	private readonly pkgVersion?: string;
	private readonly runtimeLibRbxPath?: RbxPath;
	private readonly nodeModulesRbxPath?: RbxPath;

	public readonly projectType: ProjectType;

	private readonly nodeModulesPathMapping = new Map<string, string>();

	/**
	 * @param tsConfigPath The path to the TypeScript configuration.
	 * @param opts The options of the project.
	 */
	constructor(tsConfigPath: string, opts: Partial<ProjectOptions>) {
		this.projectOptions = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);

		// set up project paths
		this.projectPath = path.dirname(tsConfigPath);
		this.nodeModulesPath = path.join(this.projectPath, "node_modules", "@rbxts");

		// retrieve package.json
		const pkgJsonPath = path.join(this.projectPath, "package.json");
		if (fs.pathExistsSync(pkgJsonPath)) {
			const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
			this.pkgVersion = pkgJson.version;
		}

		const rojoConfigPath = RojoConfig.findRojoConfigFilePath(this.projectPath, this.projectOptions.rojo);
		if (rojoConfigPath) {
			this.rojoConfig = RojoConfig.fromPath(rojoConfigPath);
			if (this.rojoConfig.isGame()) {
				this.projectType = ProjectType.Game;
			} else {
				this.projectType = ProjectType.Model;
			}
		} else {
			this.rojoConfig = RojoConfig.synthetic(this.projectPath);
			this.projectType = ProjectType.Package;
		}

		// validates and establishes runtime library
		if (this.projectType !== ProjectType.Package) {
			const runtimeFsPath = path.join(this.projectOptions.includePath, "RuntimeLib.lua");
			const runtimeLibRbxPath = this.rojoConfig.getRbxPathFromFilePath(runtimeFsPath);
			if (!runtimeLibRbxPath) {
				throw new ProjectError(
					`A Rojo project file was found ( ${this.rojoFilePath} ), but contained no data for include folder!`,
				);
			} else if (this.rojoConfig.getNetworkType(runtimeLibRbxPath) !== NetworkType.Unknown) {
				throw new ProjectError(`Runtime library cannot be in a server-only or client-only container!`);
			} else if (this.rojoConfig.isIsolated(runtimeLibRbxPath)) {
				throw new ProjectError(`Runtime library cannot be in an isolated container!`);
			}
			this.runtimeLibRbxPath = runtimeLibRbxPath;
		}

		if (fs.pathExistsSync(this.nodeModulesPath)) {
			this.nodeModulesRbxPath = this.rojoConfig.getRbxPathFromFilePath(this.nodeModulesPath);

			// map module paths
			for (const pkgName of fs.readdirSync(this.nodeModulesPath)) {
				const pkgPath = path.join(this.nodeModulesPath, pkgName);
				const pkgJsonPath = path.join(pkgPath, "package.json");
				if (fs.existsSync(pkgJsonPath)) {
					const pkgJson = fs.readJSONSync(pkgJsonPath) as { main?: string; typings?: string; types?: string };
					const mainPath = pkgJson.main;
					// both types and typings are valid
					const typesPath = pkgJson.types ?? pkgJson.typings;
					if (mainPath && typesPath) {
						this.nodeModulesPathMapping.set(
							path.resolve(pkgPath, typesPath),
							path.resolve(pkgPath, mainPath),
						);
					}
				}
			}
		}

		// obtain TypeScript command line options and validate
		const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(tsConfigPath, {}, createParseConfigFileHost());

		if (parsedCommandLine === undefined) {
			throw new ProjectError("Unable to load TS program!");
		}

		if (parsedCommandLine.errors.length > 0) {
			throw new DiagnosticError(parsedCommandLine.errors);
		}

		this.compilerOptions = parsedCommandLine.options;
		validateCompilerOptions(this.compilerOptions, this.nodeModulesPath);

		this.rootDir = this.compilerOptions.rootDir;
		this.outDir = this.compilerOptions.outDir;

		// super hack!
		// we set `ts.version` so that new versions of roblox-ts trigger full re-compile for incremental mode

		// eslint-disable-next-line @typescript-eslint/ban-ts-ignore
		// @ts-ignore
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		ts.version = require("./../../package.json").version;

		this.program = ts.createEmitAndSemanticDiagnosticsBuilderProgram(
			parsedCommandLine.fileNames,
			this.compilerOptions,
			ts.createIncrementalCompilerHost(this.compilerOptions),
			ts.readBuilderProgram(this.compilerOptions, createReadBuildProgramHost()),
		);

		this.typeChecker = this.program.getProgram().getTypeChecker();

		this.globalSymbols = new GlobalSymbols(this.typeChecker);
		this.macroManager = new MacroManager(this.program, this.typeChecker, this.nodeModulesPath);

		const roactIndexSourceFile = this.program.getSourceFile(path.join(this.nodeModulesPath, "roact", "index.d.ts"));
		if (roactIndexSourceFile) {
			this.roactSymbolManager = new RoactSymbolManager(this.typeChecker, roactIndexSourceFile);
		}

		// create `PathTranslator` to ensure paths of input, output, and include paths are relative to project
		this.pathTranslator = new PathTranslator(this.rootDir, this.outDir);
	}

	/**
	 * cleans up 'orphaned' files - Files which don't belong to any source file
	 * in the out directory.
	 */
	public async cleanup() {
		if (fs.pathExists(this.outDir)) {
			await cleanupDirRecursively(this.pathTranslator, this.rootDir, this.outDir);
		}
	}

	private getCustomPreEmitDiagnostics(sourceFile: ts.SourceFile) {
		const diagnostics: Array<ts.Diagnostic> = [];
		preEmitDiagnostics.forEach(check => diagnostics.push(...check(sourceFile)));
		return diagnostics;
	}

	/**
	 * 'transpiles' TypeScript project into a logically identical Lua project.
	 * writes rendered lua source to the out directory.
	 */
	public compile() {
		const multiTransformState = new MultiTransformState(this.pkgVersion);

		const totalDiagnostics = new Array<ts.Diagnostic>();

		const buildState = this.program.getState();

		// build a reversed referencedMap
		const reversedRefMap = new Map<string, Set<string>>();
		if (buildState.referencedMap) {
			buildState.referencedMap.forEach((referencedSet, fileName) => {
				referencedSet.forEach((_, refFileName) => {
					getOrSetDefault(reversedRefMap, refFileName, () => new Set()).add(fileName);
				});
			});
		}

		// build set of changed files + files that reference changed files
		const compileSet = new Set<string>();
		buildState.changedFilesSet?.forEach((_, fileName) => {
			compileSet.add(fileName);
			reversedRefMap.get(fileName)?.forEach(fileName => compileSet.add(fileName));
		});

		// iterate through each source file in the project as a `ts.SourceFile`
		compileSet.forEach((_, fileName) => {
			const sourceFile = this.program.getSourceFile(fileName);
			assert(sourceFile);

			if (!sourceFile.isDeclarationFile && !ts.isJsonSourceFile(sourceFile)) {
				console.log("compile", sourceFile.fileName);

				const customPreEmitDiagnostics = this.getCustomPreEmitDiagnostics(sourceFile);
				totalDiagnostics.push(...customPreEmitDiagnostics);
				if (totalDiagnostics.length > 0) return;

				const preEmitDiagnostics = ts.getPreEmitDiagnostics(this.program, sourceFile);
				totalDiagnostics.push(...preEmitDiagnostics);
				if (totalDiagnostics.length > 0) return;

				// create a new transform state for the file
				const transformState = new TransformState(
					this.compilerOptions,
					multiTransformState,
					this.rojoConfig,
					this.pathTranslator,
					this.runtimeLibRbxPath,
					this.nodeModulesPath,
					this.nodeModulesRbxPath,
					this.nodeModulesPathMapping,
					this.typeChecker,
					this.globalSymbols,
					this.macroManager,
					this.roactSymbolManager,
					this.projectType,
					sourceFile,
				);

				// create a new Lua abstract syntax tree for the file
				const luaAST = transformSourceFile(transformState, sourceFile);
				totalDiagnostics.push(...transformState.diagnostics);
				if (totalDiagnostics.length > 0) return;

				// render lua abstract syntax tree and output only if there were no diagnostics
				const luaSource = renderAST(luaAST);
				fs.outputFileSync(this.pathTranslator.getOutputPath(sourceFile.fileName), luaSource);
			}
		});
		if (totalDiagnostics.length > 0) {
			throw new DiagnosticError(totalDiagnostics);
		}
		this.program.getProgram().emitBuildInfo();
	}
}

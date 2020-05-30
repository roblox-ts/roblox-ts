import ts from "byots";
import fs from "fs-extra";
import { renderAST } from "LuaRenderer";
import path from "path";
import { createParseConfigFileHost } from "Project/util/createParseConfigFileHost";
import { validateCompilerOptions } from "Project/util/validateCompilerOptions";
import { ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
import { PathTranslator } from "Shared/PathTranslator";
import { NetworkType, RbxPath, RojoConfig } from "Shared/RojoConfig";
import {
	CompileState,
	GlobalSymbols,
	MacroManager,
	RoactSymbolManager,
	transformSourceFile,
	TransformState,
} from "TSTransformer";
import { cleanupDirRecursively } from "Shared/fsUtil";

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

	private readonly program: ts.Program;
	private readonly typeChecker: ts.TypeChecker;
	private readonly options: ProjectOptions;
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
		// Set up project paths
		this.projectPath = path.dirname(tsConfigPath);
		this.nodeModulesPath = path.join(this.projectPath, "node_modules", "@rbxts");

		// Retrieve package.json
		const pkgJsonPath = path.join(this.projectPath, "package.json");
		if (fs.pathExistsSync(pkgJsonPath)) {
			const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
			this.pkgVersion = pkgJson.version;
		}

		this.options = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);

		// Obtain TypeScript command line options and validate
		const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(tsConfigPath, {}, createParseConfigFileHost());

		if (parsedCommandLine === undefined) {
			throw new ProjectError("Unable to load TS program!");
		}

		if (parsedCommandLine.errors.length > 0) {
			throw new DiagnosticError(parsedCommandLine.errors);
		}

		const compilerOptions = parsedCommandLine.options;
		validateCompilerOptions(compilerOptions, this.nodeModulesPath);

		this.rootDir = compilerOptions.rootDir;
		this.outDir = compilerOptions.outDir;

		// Obtain TypeScript command line options and validate
		const rojoConfigPath = RojoConfig.findRojoConfigFilePath(this.projectPath, this.options.rojo);
		if (rojoConfigPath) {
			this.rojoConfig = RojoConfig.fromPathSync(rojoConfigPath);
			if (this.rojoConfig.isGame()) {
				this.projectType = ProjectType.Game;
			} else {
				this.projectType = ProjectType.Model;
			}
		} else {
			this.rojoConfig = RojoConfig.synthetic(this.projectPath);
			this.projectType = ProjectType.Package;
		}

		// Validates and establishes runtime library
		if (this.projectType !== ProjectType.Package) {
			const runtimeFsPath = path.join(this.options.includePath, "RuntimeLib.lua");
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

		// Set up TypeScript program for project
		// This will generate the `ts.SourceFile` objects for each file in our project
		this.program = ts.createProgram({
			rootNames: parsedCommandLine.fileNames,
			options: compilerOptions,
		});

		this.typeChecker = this.program.getTypeChecker();

		this.globalSymbols = new GlobalSymbols(this.typeChecker);
		this.macroManager = new MacroManager(this.program, this.typeChecker, this.nodeModulesPath);

		const roactIndexSourceFile = this.program.getSourceFile(path.join(this.nodeModulesPath, "roact", "index.d.ts"));
		if (roactIndexSourceFile) {
			this.roactSymbolManager = new RoactSymbolManager(this.typeChecker, roactIndexSourceFile);
		}

		// Create `PathTranslator` to ensure paths of input, output, and include paths are relative to project
		this.pathTranslator = new PathTranslator(this.rootDir, this.outDir);
	}

	/**
	 * Cleans up 'orphaned' files - Files which don't belong to any source file
	 * in the out directory.
	 */
	public async cleanup() {
		if (fs.pathExists(this.outDir)) {
			await cleanupDirRecursively(this.pathTranslator, this.rootDir, this.outDir);
		}
	}

	/**
	 * 'Transpiles' TypeScript project into a logically identical Lua project.
	 * Writes rendered lua source to the out directory.
	 */
	public compile() {
		const compileState = new CompileState(this.pkgVersion);

		const totalDiagnostics = new Array<ts.Diagnostic>();
		// Iterate through each source file in the project as a `ts.SourceFile`
		for (const sourceFile of this.program.getSourceFiles()) {
			if (!sourceFile.isDeclarationFile) {
				// Catch pre emit diagnostics
				const preEmitDiagnostics = ts.getPreEmitDiagnostics(this.program, sourceFile);
				totalDiagnostics.push(...preEmitDiagnostics);
				if (totalDiagnostics.length > 0) continue;

				// Create a new transform state for the file
				const transformState = new TransformState(
					compileState,
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

				// Create a new Lua abstract syntax tree for the file
				const luaAST = transformSourceFile(transformState, sourceFile);
				totalDiagnostics.push(...transformState.diagnostics);
				if (totalDiagnostics.length > 0) continue;

				// Render lua abstract syntax tree and output only if there were no diagnostics
				const luaSource = renderAST(luaAST);
				fs.outputFileSync(this.pathTranslator.getOutputPath(sourceFile.fileName), luaSource);
			}
		}
		if (totalDiagnostics.length > 0) {
			throw new DiagnosticError(totalDiagnostics);
		}
	}
}

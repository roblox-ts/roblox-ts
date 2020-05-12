import ts from "byots";
import fs from "fs-extra";
import { renderAST } from "LuaRenderer";
import path from "path";
import { createParseConfigFileHost } from "Project/util/createParseConfigFileHost";
import { validateCompilerOptions } from "Project/util/validateCompilerOptions";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
import { PathTranslator } from "Shared/PathTranslator";
import { NetworkType, RojoConfig, RbxPath } from "Shared/RojoConfig";
import { CompileState, MacroManager, transformSourceFile, TransformState } from "TSTransformer";

const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "include",
	rojo: "",
};

export interface ProjectOptions {
	includePath: string;
	rojo: string;
}

export class Project {
	public readonly projectPath: string;
	public readonly nodeModulesPath: string;
	public readonly rootDir: string;
	public readonly outDir: string;
	public readonly rojoFilePath: string | undefined;

	private readonly program: ts.Program;
	private readonly typeChecker: ts.TypeChecker;
	private readonly options: ProjectOptions;
	private readonly macroManager: MacroManager;
	private readonly rojoConfig: RojoConfig;
	private readonly pathTranslator: PathTranslator;
	private readonly pkgVersion?: string;
	private readonly runtimeLibRbxPath: RbxPath;

	constructor(tsConfigPath: string, opts: Partial<ProjectOptions>) {
		this.projectPath = path.dirname(tsConfigPath);
		this.nodeModulesPath = path.join(this.projectPath, "node_modules");

		const pkgJsonPath = path.join(this.projectPath, "package.json");
		if (fs.pathExistsSync(pkgJsonPath)) {
			const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
			this.pkgVersion = pkgJson.version;
		}

		this.options = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);

		const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(tsConfigPath, {}, createParseConfigFileHost());

		if (parsedCommandLine === undefined) {
			throw new ProjectError("Unable to load TS program!");
		}

		if (parsedCommandLine.errors.length > 0) {
			throw new DiagnosticError(parsedCommandLine.errors);
		}

		const compilerOptions = parsedCommandLine.options;
		validateCompilerOptions(compilerOptions, this.nodeModulesPath);

		const rojoConfigPath = RojoConfig.findRojoConfigFilePath(this.projectPath, this.options.rojo);
		if (!rojoConfigPath) {
			throw new ProjectError("Unable to find Rojo configuration file!");
		}
		this.rojoConfig = RojoConfig.fromPathSync(rojoConfigPath);

		const runtimeFsPath = path.join(this.options.includePath, "RuntimeLib.lua");
		const runtimeLibRbxPath = this.rojoConfig.getRbxPathFromFilePath(runtimeFsPath);
		if (!runtimeLibRbxPath) {
			throw new ProjectError(
				`A Rojo project file was found ( ${this.rojoFilePath} ), but contained no data for include folder!`,
			);
		} else if (this.rojoConfig.getNetworkType(runtimeFsPath) !== NetworkType.Unknown) {
			throw new ProjectError(`Runtime library cannot be in a server-only or client-only container!`);
		} else if (this.rojoConfig.isIsolated(runtimeFsPath)) {
			throw new ProjectError(`Runtime library cannot be in an isolated container!`);
		}
		this.runtimeLibRbxPath = runtimeLibRbxPath;

		this.rootDir = compilerOptions.rootDir;
		this.outDir = compilerOptions.outDir;

		this.program = ts.createProgram({
			rootNames: parsedCommandLine.fileNames,
			options: compilerOptions,
		});

		this.typeChecker = this.program.getTypeChecker();

		this.macroManager = new MacroManager(this.program, this.typeChecker, this.nodeModulesPath);

		this.pathTranslator = new PathTranslator(this.rootDir, this.outDir);
	}

	public compile() {
		const compileState = new CompileState(this.pkgVersion);

		const totalDiagnostics = new Array<ts.Diagnostic>();
		for (const sourceFile of this.program.getSourceFiles()) {
			if (!sourceFile.isDeclarationFile) {
				const preEmitDiagnostics = ts.getPreEmitDiagnostics(this.program, sourceFile);
				totalDiagnostics.push(...preEmitDiagnostics);
				if (totalDiagnostics.length > 0) continue;

				const transformState = new TransformState(
					compileState,
					this.rojoConfig,
					this.pathTranslator,
					this.runtimeLibRbxPath,
					this.typeChecker,
					this.macroManager,
					sourceFile,
				);

				const luaAST = transformSourceFile(transformState, sourceFile);
				totalDiagnostics.push(...transformState.diagnostics);
				if (totalDiagnostics.length > 0) continue;

				const luaSource = renderAST(luaAST);
				fs.outputFileSync(this.pathTranslator.getOutPath(sourceFile.fileName), luaSource);
			}
		}
		if (totalDiagnostics.length > 0) {
			throw new DiagnosticError(totalDiagnostics);
		}
	}
}

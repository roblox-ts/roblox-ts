import ts from "byots";
import fs from "fs-extra";
import { renderAST } from "LuaRenderer";
import path from "path";
import { NetworkType, RojoConfig } from "Project/RojoConfig";
import { createParseConfigFileHost } from "Project/util/createParseConfigFileHost";
import { validateCompilerOptions } from "Project/util/validateCompilerOptions";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
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

	constructor(tsConfigPath: string, opts: Partial<ProjectOptions>) {
		this.projectPath = path.dirname(tsConfigPath);
		this.nodeModulesPath = path.join(this.projectPath, "node_modules");

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
		const runtimeLibPath = this.rojoConfig.getRbxFromFilePath(runtimeFsPath).path;
		if (!runtimeLibPath) {
			throw new ProjectError(
				`A Rojo project file was found ( ${this.rojoFilePath} ), but contained no data for include folder!`,
			);
		} else if (this.rojoConfig.getNetworkType(runtimeFsPath) !== NetworkType.Unknown) {
			throw new ProjectError(`Runtime library cannot be in a server-only or client-only container!`);
		} else if (this.rojoConfig.isIsolated(runtimeFsPath)) {
			throw new ProjectError(`Runtime library cannot be in an isolated container!`);
		}

		this.rootDir = compilerOptions.rootDir;
		this.outDir = compilerOptions.outDir;

		this.program = ts.createProgram({
			rootNames: parsedCommandLine.fileNames,
			options: compilerOptions,
		});

		this.typeChecker = this.program.getTypeChecker();

		this.macroManager = new MacroManager(this.program, this.typeChecker, this.nodeModulesPath);
	}

	private getFileExtensions(filePath: string): Array<string> {
		const ext = path.extname(filePath);
		if (ext === "") {
			return [filePath];
		}
		return [...this.getFileExtensions(filePath.slice(0, -ext.length)), ext];
	}

	private getOutPath(filePath: string) {
		const filename = path.basename(filePath);
		const directory = filePath.slice(0, -filename.length);
		const extensions = this.getFileExtensions(path.basename(filePath));
		if (extensions[extensions.length - 1] === ".ts") extensions.pop();
		// .d.ts does not get compiled or outputted, why check for it?
		if (extensions[extensions.length - 1] === ".d") extensions.pop();
		if (extensions[0] === "index") {
			extensions[0] = "init";
		}

		filePath = path.join(directory, extensions.join());
		const relativeToRoot = path.relative(this.rootDir, filePath);
		return path.join(this.outDir, relativeToRoot + ".lua");
	}

	public compile() {
		const compileState = new CompileState();

		const totalDiagnostics = new Array<ts.Diagnostic>();
		for (const sourceFile of this.program.getSourceFiles()) {
			if (!sourceFile.isDeclarationFile) {
				const preEmitDiagnostics = ts.getPreEmitDiagnostics(this.program, sourceFile);
				totalDiagnostics.push(...preEmitDiagnostics);
				if (totalDiagnostics.length > 0) continue;

				const transformState = new TransformState(
					compileState,
					this.typeChecker,
					this.macroManager,
					sourceFile,
				);
				const luaAST = transformSourceFile(transformState, sourceFile);
				totalDiagnostics.push(...transformState.diagnostics);
				if (totalDiagnostics.length > 0) continue;

				const luaSource = renderAST(luaAST);
				fs.outputFileSync(this.getOutPath(sourceFile.fileName), luaSource);
			}
		}
		if (totalDiagnostics.length > 0) {
			throw new DiagnosticError(totalDiagnostics);
		}
	}
}

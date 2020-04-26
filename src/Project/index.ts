import fs from "fs-extra";
import { renderAST } from "LuaRenderer";
import path from "path";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";
import { createParseConfigFileHost } from "Project/util/createParseConfigFileHost";
import { validateCompilerOptions } from "Project/util/validateCompilerOptions";
import { transformSourceFile, TransformState, MacroManager } from "TSTransformer";
import ts from "typescript";

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

		this.rootDir = compilerOptions.rootDir;
		this.outDir = compilerOptions.outDir;

		this.program = ts.createProgram({
			rootNames: parsedCommandLine.fileNames,
			options: compilerOptions,
		});

		this.typeChecker = this.program.getTypeChecker();

		this.macroManager = new MacroManager(this.program, this.typeChecker, this.nodeModulesPath);
	}

	private getOutPath(filePath: string) {
		const ext = path.extname(filePath);
		if (ext === ".ts") filePath = filePath.slice(0, -ext.length);
		const subExt = path.extname(filePath);
		if (subExt === ".d") filePath = filePath.slice(0, -subExt.length);

		const relativeToRoot = path.relative(this.rootDir, filePath);
		return path.join(this.outDir, relativeToRoot + ".lua");
	}

	public compile() {
		const totalDiagnostics = new Array<ts.Diagnostic>();
		for (const sourceFile of this.program.getSourceFiles()) {
			if (!sourceFile.isDeclarationFile) {
				const preEmitDiagnostics = ts.getPreEmitDiagnostics(this.program, sourceFile);
				totalDiagnostics.push(...preEmitDiagnostics);
				if (totalDiagnostics.length > 0) continue;

				const transformState = new TransformState(this.typeChecker, this.macroManager, sourceFile);
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

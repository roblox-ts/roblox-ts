import path from "path";
import { DiagnosticError } from "TSProject/errors/DiagnosticError";
import { ProjectError } from "TSProject/errors/ProjectError";
import * as fsUtil from "TSProject/util/fsUtil";
import { createParseConfigFileHost } from "TSProject/util/tsUtil";
import { validateCompilerOptions } from "TSProject/util/validateCompilerOptions";
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
	public readonly rootDirs: Set<string>;
	public readonly outDir: string;
	public readonly rojoFilePath: string | undefined;

	private readonly program: ts.Program;
	private readonly parsedCommandLine: ts.ParsedCommandLine;
	private readonly tsConfigPath: string;
	private readonly options: ProjectOptions;

	constructor(tsConfigPath: string, opts: Partial<ProjectOptions>) {
		this.tsConfigPath = tsConfigPath;
		this.projectPath = path.dirname(tsConfigPath);
		this.nodeModulesPath = path.join(this.projectPath, "node_modules");

		this.options = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);

		const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(tsConfigPath, {}, createParseConfigFileHost());

		if (parsedCommandLine === undefined) {
			throw new ProjectError("Unable to load TS program!");
		}
		this.parsedCommandLine = parsedCommandLine;

		if (parsedCommandLine.errors.length > 0) {
			throw new DiagnosticError(parsedCommandLine.errors);
		}

		const compilerOptions = parsedCommandLine.options;
		validateCompilerOptions(compilerOptions, this.nodeModulesPath);

		this.program = ts.createProgram({
			rootNames: parsedCommandLine.fileNames,
			options: compilerOptions,
		});

		this.rootDirs = new Set<string>();
		if (compilerOptions.rootDir) {
			this.rootDirs.add(compilerOptions.rootDir);
		}
		if (compilerOptions.rootDirs) {
			for (const dir of compilerOptions.rootDirs) {
				this.rootDirs.add(dir);
			}
		}
		if (this.rootDirs.size === 0) {
			this.rootDirs.add(path.resolve(path.dirname(this.tsConfigPath)));
		}

		this.outDir = compilerOptions.outDir;
	}

	private getRootDirForFilePath(filePath: string) {
		for (const rootDir of this.rootDirs) {
			if (fsUtil.isPathDescendantOf(filePath, rootDir)) {
				return rootDir;
			}
		}
		throw new ProjectError(`Unable to find rootDir for "${filePath}"`);
	}

	private getOutDirForFilePath(filePath: string) {
		if (this.rootDirs.size === 1) {
			return this.outDir;
		}
		return path.join(this.outDir, path.basename(this.getRootDirForFilePath(filePath)));
	}

	public compile() {}
}

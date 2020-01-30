import path from "path";
import { DiagnosticError } from "TSProject/errors/DiagnosticError";
import { ProjectError } from "TSProject/errors/ProjectError";
import { createParseConfigFileHost } from "TSProject/util/tsUtil";
import ts from "typescript";
import * as fsUtil from "TSProject/util/fsUtil";

const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "include",
	rojo: "",
};

export interface ProjectOptions {
	includePath: string;
	rojo: string;
}

export class Project {
	public readonly rootDirs: Set<string>;
	public readonly rojoFilePath: string | undefined;

	private readonly program: ts.Program;
	private readonly tsConfigPath: string;
	private readonly options: ProjectOptions;

	constructor(tsConfigPath: string, opts: Partial<ProjectOptions>) {
		this.tsConfigPath = tsConfigPath;
		this.options = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);

		const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(
			tsConfigPath,
			ts.getDefaultCompilerOptions(),
			createParseConfigFileHost(),
		);

		if (parsedCommandLine === undefined) {
			throw new ProjectError("Unable to load TS program!");
		}

		if (parsedCommandLine.errors.length > 0) {
			throw new DiagnosticError(parsedCommandLine.errors);
		}

		this.program = ts.createProgram({
			rootNames: parsedCommandLine.fileNames,
			options: parsedCommandLine.options,
		});

		this.rootDirs = new Set<string>();
		if (parsedCommandLine.options.rootDir) {
			this.rootDirs.add(parsedCommandLine.options.rootDir);
		}
		if (parsedCommandLine.options.rootDirs) {
			for (const dir of parsedCommandLine.options.rootDirs) {
				this.rootDirs.add(dir);
			}
		}
		if (this.rootDirs.size === 0) {
			this.rootDirs.add(path.resolve(path.dirname(this.tsConfigPath)));
		}
	}

	private getRootDirForFilePath(filePath: string) {
		for (const rootDir of this.rootDirs) {
			if (fsUtil.isPathDescendantOf(filePath, rootDir)) {
				return rootDir;
			}
		}
	}

	private getOutDirForFilePath(filePath: string) {}

	public compile() {
		console.log([...this.rootDirs]);
		console.log(this.program.getRootFileNames());
		// for (const sourceFile of this.program.getSourceFiles()) {
		// 	if (!sourceFile.isDeclarationFile) {
		// 		transformSourceFile(new TransformState(), sourceFile);
		// 	}
		// }
	}
}

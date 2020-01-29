import path from "path";
import { DiagnosticError } from "TSProject/errors/DiagnosticError";
import { ProjectError } from "TSProject/errors/ProjectError";
import { createParseConfigFileHost } from "TSProject/util/createParseConfigFileHost";
import { transformSourceFile } from "TSTransformer/nodes/sourceFile";
import { TransformState } from "TSTransformer/TransformState";
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
	public readonly rootDir: string;
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
		this.rootDir = this.program.getCompilerOptions().rootDir ?? path.resolve(path.dirname(this.tsConfigPath));
	}

	public compile() {
		for (const sourceFile of this.program.getSourceFiles()) {
			if (!sourceFile.isDeclarationFile) {
				transformSourceFile(new TransformState(), sourceFile);
			}
		}
	}
}

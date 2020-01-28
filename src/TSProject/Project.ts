import { transformSourceFile } from "TSTransformer/nodes/sourceFile";
import { TransformState } from "TSTransformer/TransformState";
import ts from "typescript";

function createParseConfigFileHost(): ts.ParseConfigFileHost {
	return {
		fileExists: ts.sys.fileExists,
		getCurrentDirectory: ts.sys.getCurrentDirectory,
		onUnRecoverableConfigFileDiagnostic: d => console.error(ts.flattenDiagnosticMessageText(d.messageText, "\n")),
		readDirectory: ts.sys.readDirectory,
		readFile: ts.sys.readFile,
		useCaseSensitiveFileNames: true,
	};
}

const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "include",
	rojo: "",
};

export interface ProjectOptions {
	includePath: string;
	rojo: string;
}

export class Project {
	private readonly program: ts.Program;

	constructor(tsConfigPath: string, opts: Partial<ProjectOptions>) {
		const options: ProjectOptions = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);
		const parsedCommandLine = ts.getParsedCommandLineOfConfigFile(tsConfigPath, {}, createParseConfigFileHost());
		if (parsedCommandLine === undefined) throw new Error();
		this.program = ts.createProgram({
			rootNames: parsedCommandLine.fileNames,
			options: parsedCommandLine.options,
		});
	}

	public getRootDir() {
		return this.program.getCompilerOptions().rootDir ?? ts.getDefaultCompilerOptions().rootDir;
	}

	public compile() {
		for (const sourceFile of this.program.getSourceFiles()) {
			if (!sourceFile.isDeclarationFile) {
				transformSourceFile(new TransformState(), sourceFile);
			}
		}
	}
}

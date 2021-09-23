import ts from "typescript";

export function createReadBuildProgramHost() {
	return {
		getCurrentDirectory: ts.sys.getCurrentDirectory,
		readFile: ts.sys.readFile,
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
	};
}

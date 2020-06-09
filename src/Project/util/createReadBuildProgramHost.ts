import ts from "byots";

export function createReadBuildProgramHost() {
	return {
		getCurrentDirectory: ts.sys.getCurrentDirectory,
		readFile: ts.sys.readFile,
		useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
	};
}

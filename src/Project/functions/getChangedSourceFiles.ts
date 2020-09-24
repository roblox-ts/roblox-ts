import ts from "byots";
import { getChangedFilePaths } from "Project/functions/getChangedFilePaths";
import { assert } from "Shared/util/assert";

export function getChangedSourceFiles(program: ts.BuilderProgram, pathHints?: Array<string>) {
	const sourceFiles = new Array<ts.SourceFile>();
	for (const fileName of getChangedFilePaths(program, pathHints)) {
		const sourceFile = program.getSourceFile(fileName);
		assert(sourceFile);
		if (!sourceFile.isDeclarationFile && !ts.isJsonSourceFile(sourceFile)) {
			sourceFiles.push(sourceFile);
		}
	}
	return sourceFiles;
}

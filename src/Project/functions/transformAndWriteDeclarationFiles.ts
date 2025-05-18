import { PathTranslator } from "@roblox-ts/path-translator";
import transformPathsTransformer from "Project/transformers/builtin/transformPaths";
import { assert } from "Shared/util/assert";
import ts from "typescript";

export function transformAndWriteDeclarationFiles(
	program: ts.Program,
	pathTranslator: PathTranslator,
	files: Array<ts.SourceFile>,
) {
	const transformResult = ts.transform(files, [transformPathsTransformer(program, {})], program.getCompilerOptions());
	const printer = ts.createPrinter({});
	for (const sourceFile of transformResult.transformed) {
		assert(!ts.isBundle(sourceFile));
		ts.sys.writeFile(pathTranslator.getOutputPath(sourceFile.fileName), printer.printFile(sourceFile));
	}
}

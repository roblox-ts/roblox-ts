import transformPaths from "Project/transformers/builtin/transformPaths";
import { assert } from "Shared/util/assert";
import ts from "typescript";

export function transformDeclarationFile(program: ts.Program, fileName: string) {
	const contents = ts.sys.readFile(fileName);
	assert(contents !== undefined);

	// declaration assets can be outside the program, and transforms must not mutate its bound nodes
	const sourceFile = ts.createSourceFile(fileName, contents, ts.ScriptTarget.Latest, true);
	const result = ts.transform(sourceFile, [transformPaths(program, {})], program.getCompilerOptions());
	try {
		const [transformed] = result.transformed;
		assert(ts.isSourceFile(transformed));
		return ts.createPrinter().printFile(transformed);
	} finally {
		result.dispose();
	}
}

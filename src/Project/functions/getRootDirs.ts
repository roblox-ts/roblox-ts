import ts from "byots";
import { assert } from "Shared/util/assert";

export function getRootDirs(program: ts.BuilderProgram) {
	const compilerOptions = program.getCompilerOptions();
	const rootDirs = compilerOptions.rootDir ? [compilerOptions.rootDir] : compilerOptions.rootDirs;
	assert(rootDirs);
	return rootDirs;
}

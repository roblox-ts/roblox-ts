import ts from "byots";
import { assert } from "Shared/util/assert";

export function getRootDirs(compilerOptions: ts.CompilerOptions) {
	const rootDirs = compilerOptions.rootDir ? [compilerOptions.rootDir] : compilerOptions.rootDirs;
	assert(rootDirs);
	return rootDirs;
}

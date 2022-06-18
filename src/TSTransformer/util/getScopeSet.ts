import path from "path";
import ts from "typescript";

export function getScopeSet(compilerOptions: ts.CompilerOptions) {
	const result = new Set<string>();
	for (const typeRoot of compilerOptions.typeRoots ?? []) {
		const baseName = path.basename(typeRoot);
		if (baseName.startsWith("@")) {
			result.add(baseName);
		}
	}
	return result;
}

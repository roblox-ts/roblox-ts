import ts from "byots";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";

/**
 * generates a `Set<string>` of paths for changed files + dependencies
 *
 * if `incremental == false`, this will return all project files
 *
 * if `assumeChangesOnlyAffectDirectDependencies == false`, this will only check direct dependencies
 */
export function getChangedFilePaths(program: ts.BuilderProgram, pathHints?: Array<string>) {
	const compilerOptions = program.getCompilerOptions();
	const buildState = program.getState();

	// buildState.referencedMap is sourceFile -> files that this file imports
	// but we need sourceFile -> files that import this file
	const reversedReferencedMap = new Map<string, Set<string>>();
	buildState.referencedMap?.forEach((referencedSet, filePath) => {
		referencedSet.forEach((_, refFilePath) => {
			getOrSetDefault(reversedReferencedMap, refFilePath, () => new Set()).add(filePath);
		});
	});

	const changedFilesSet = new Set<string>();

	const search = (filePath: string) => {
		changedFilesSet.add(filePath);
		reversedReferencedMap.get(filePath)?.forEach(refFilePath => {
			if (!changedFilesSet.has(refFilePath)) {
				changedFilesSet.add(refFilePath);
				if (compilerOptions.assumeChangesOnlyAffectDirectDependencies !== true) {
					search(refFilePath);
				}
			}
		});
	};

	if (pathHints) {
		for (const hint of pathHints) {
			search(hint);
		}
	} else {
		buildState.changedFilesSet?.forEach((_, fileName) => search(fileName));
	}

	return changedFilesSet;
}

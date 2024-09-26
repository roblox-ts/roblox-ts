import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";
import ts from "typescript";

/**
 * generates a `Set<string>` of paths for changed files + dependencies
 *
 * if `incremental == false`, this will return all project files
 *
 * if `assumeChangesOnlyAffectDirectDependencies == false`, this will only check direct dependencies
 */
export function getChangedFilePaths(program: ts.BuilderProgram, pathHints?: Array<string>) {
	const compilerOptions = program.getCompilerOptions();
	const buildState = program.state;

	// buildState.referencedMap is sourceFile -> files that this file imports
	// but we need sourceFile -> files that import this file
	const reversedReferencedMap = new Map<string, Set<string>>();

	const referencedMap = buildState.referencedMap;

	if (referencedMap) {
		for (const filePath of ts.arrayFrom(referencedMap.keys())) {
			referencedMap.getValues(filePath)?.forEach((_, refFilePath) => {
				getOrSetDefault(reversedReferencedMap, refFilePath, () => new Set()).add(filePath);
			});
		}
	}

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
			search(getCanonicalFileName(hint));
		}
	} else {
		buildState.changedFilesSet?.forEach((_, fileName) => search(fileName));
		buildState.changedFilesSet?.clear();
	}

	return changedFilesSet;
}

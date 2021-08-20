import path from "path";
import { walkPackageJsons } from "Project/util/walkPackageJsons";
import ts from "typescript";

export function createNodeModulesPathMapping(typeRoots: Array<string>) {
	const getCanonicalFileName = ts.createGetCanonicalFileName(ts.sys.useCaseSensitiveFileNames);

	const nodeModulesPathMapping = new Map<string, string>();
	walkPackageJsons(typeRoots, (pkgJson, pkgPath) => {
		if (pkgJson.main) {
			nodeModulesPathMapping.set(
				getCanonicalFileName(path.resolve(pkgPath, pkgJson.types ?? pkgJson.typings ?? "index.d.ts")),
				getCanonicalFileName(path.resolve(pkgPath, pkgJson.main)),
			);
		}
	});
	return nodeModulesPathMapping;
}

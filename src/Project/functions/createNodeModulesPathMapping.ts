import fs from "fs-extra";
import path from "path";
import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";

export function createNodeModulesPathMapping(typeRoots: Array<string>) {
	const nodeModulesPathMapping = new Map<string, string>();
	// go through each org
	for (const scopePath of typeRoots) {
		if (fs.pathExistsSync(scopePath)) {
			// map module paths
			for (const pkgName of fs.readdirSync(scopePath)) {
				const pkgPath = path.join(scopePath, pkgName);
				const pkgJsonPath = realPathExistsSync(path.join(pkgPath, "package.json"));
				if (pkgJsonPath !== undefined) {
					const pkgJson = fs.readJsonSync(pkgJsonPath) as {
						main?: string;
						typings?: string;
						types?: string;
					};
					// both "types" and "typings" are valid
					const typesPath = pkgJson.types ?? pkgJson.typings ?? "index.d.ts";
					if (pkgJson.main) {
						nodeModulesPathMapping.set(
							getCanonicalFileName(path.resolve(pkgPath, typesPath)),
							path.resolve(pkgPath, pkgJson.main),
						);
					}
				}
			}
		}
	}
	return nodeModulesPathMapping;
}

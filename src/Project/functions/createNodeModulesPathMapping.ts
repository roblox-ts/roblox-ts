import fs from "fs-extra";
import path from "path";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";

export function createNodeModulesPathMapping(nodeModulesPath: string) {
	const nodeModulesPathMapping = new Map<string, string>();
	if (fs.pathExistsSync(nodeModulesPath)) {
		// map module paths
		for (const pkgName of fs.readdirSync(nodeModulesPath)) {
			const pkgPath = path.join(nodeModulesPath, pkgName);
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
					nodeModulesPathMapping.set(path.resolve(pkgPath, typesPath), path.resolve(pkgPath, pkgJson.main));
				}
			}
		}
	}
	return nodeModulesPathMapping;
}

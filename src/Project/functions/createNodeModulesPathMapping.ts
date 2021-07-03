import fs from "fs-extra";
import path from "path";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";

export function createNodeModulesPathMapping(nodeModulesPath: string) {
	const nodeModulesPathMapping = new Map<string, string>();
	if (fs.pathExistsSync(nodeModulesPath)) {
		// go through each org
		for (const scope of fs.readdirSync(nodeModulesPath, { withFileTypes: true })) {
			const scopePath = path.join(nodeModulesPath, scope.name);
			if (scope.isDirectory()) {
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
								path.resolve(pkgPath, typesPath),
								path.resolve(pkgPath, pkgJson.main),
							);
						}
					}
				}
			}
		}
	}
	return nodeModulesPathMapping;
}

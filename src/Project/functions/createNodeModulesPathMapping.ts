import fs from "fs-extra";
import path from "path";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";

export function createNodeModulesPathMapping(nodeModulesPath: string) {
	const nodeModulesPathMapping = new Map<string, string>();
	if (fs.pathExistsSync(nodeModulesPath)) {
		// go through each org
		for (const org of fs.readdirSync(nodeModulesPath, { withFileTypes: true })) {
			const orgPath = path.join(nodeModulesPath, org.name);
			if (org.isDirectory()) {
				// map module paths
				for (const pkgName of fs.readdirSync(orgPath)) {
					const pkgPath = path.join(orgPath, pkgName);
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

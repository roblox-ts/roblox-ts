import fs from "fs-extra";
import path from "path";
import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";

type PackageJson = {
	main?: string;
	types?: string;
	typings?: string;
	exports?: Record<string, unknown> | string;
};

function resolveEntry(pkgPath: string, pkgJson: PackageJson) {
	const typesPath = pkgJson.types ?? pkgJson.typings ?? "index.d.ts";

	const dtsPath = path.resolve(pkgPath, typesPath);

	let jsPath = pkgJson.main ? path.resolve(pkgPath, pkgJson.main) : undefined;

	// fallback for simple export maps
	if (!jsPath && typeof pkgJson.exports === "string") {
		jsPath = path.resolve(pkgPath, pkgJson.exports);
	}

	// last fallback
	if (!jsPath) {
		jsPath = path.resolve(pkgPath, "index.js");
	}

	return { dtsPath, jsPath };
}

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
					const pkgJson = fs.readJsonSync(pkgJsonPath) as PackageJson;
					// both "types" and "typings" are valid
					const { dtsPath, jsPath } = resolveEntry(pkgPath, pkgJson);

					// only map if both sides exist
					if (dtsPath && jsPath) {
						nodeModulesPathMapping.set(getCanonicalFileName(dtsPath), jsPath);
					}
				}
			}
		}
	}
	return nodeModulesPathMapping;
}

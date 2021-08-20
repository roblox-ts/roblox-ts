import fs from "fs-extra";
import path from "path";
import { realPathExistsSync } from "Shared/util/realPathExistsSync";

type PackageJson = {
	main?: string;
	typings?: string;
	types?: string;
	macros?: string;
	name: string;
};

export function walkPackageJsons(directories: Array<string>, callback: (pkg: PackageJson, path: string) => void) {
	for (const scopePath of directories) {
		if (fs.pathExistsSync(scopePath)) {
			for (const pkgName of fs.readdirSync(scopePath)) {
				const pkgPath = path.join(scopePath, pkgName);
				const pkgJsonPath = realPathExistsSync(path.join(pkgPath, "package.json"));
				if (pkgJsonPath !== undefined) {
					callback(fs.readJsonSync(pkgJsonPath), pkgPath);
				}
			}
		}
	}
}

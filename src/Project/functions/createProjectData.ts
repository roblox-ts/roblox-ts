import ts from "byots";
import fs from "fs-extra";
import path from "path";
import { ProjectData, ProjectFlags, ProjectOptions } from "Project/types";
import { RojoResolver } from "Shared/classes/RojoResolver";
import { NODE_MODULES, RBXTS_SCOPE } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";

const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "",
	rojo: "",
	type: undefined,
};

export function createProjectData(
	tsConfigPath: string,
	opts: Partial<ProjectOptions>,
	flags: ProjectFlags,
): ProjectData {
	const projectOptions = Object.assign({}, DEFAULT_PROJECT_OPTIONS, opts);
	const projectPath = path.dirname(tsConfigPath);

	const pkgJsonPath = ts.findPackageJson(projectPath, (ts.sys as unknown) as ts.LanguageServiceHost);
	if (!pkgJsonPath) {
		throw new ProjectError("Unable to find package.json");
	}

	let isPackage = false;
	let pkgVersion = "";
	try {
		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
		isPackage = (pkgJson.name ?? "").startsWith(RBXTS_SCOPE + "/");
		pkgVersion = pkgJson.version;
	} catch (e) {}

	// intentionally use || here for empty string case
	const includePath = path.resolve(projectOptions.includePath || path.join(projectPath, "include"));

	const nodeModulesPath = path.join(path.dirname(pkgJsonPath), NODE_MODULES, RBXTS_SCOPE);
	const nodeModulesPathMapping = new Map<string, string>();
	if (fs.pathExistsSync(nodeModulesPath)) {
		// map module paths
		for (const pkgName of fs.readdirSync(nodeModulesPath)) {
			const pkgPath = path.join(nodeModulesPath, pkgName);
			const pkgJsonPath = path.join(pkgPath, "package.json");
			if (fs.existsSync(pkgJsonPath)) {
				const pkgJson = fs.readJSONSync(pkgJsonPath) as { main?: string; typings?: string; types?: string };
				// both "types" and "typings" are valid
				const typesPath = pkgJson.types ?? pkgJson.typings ?? "index.d.ts";
				if (pkgJson.main) {
					nodeModulesPathMapping.set(path.resolve(pkgPath, typesPath), path.resolve(pkgPath, pkgJson.main));
				}
			}
		}
	}

	const rojoConfigPath = projectOptions.rojo
		? path.resolve(projectOptions.rojo)
		: RojoResolver.findRojoConfigFilePath(projectPath);

	return {
		tsConfigPath,
		includePath,
		isPackage,
		noInclude: flags.noInclude,
		nodeModulesPath,
		nodeModulesPathMapping,
		pkgVersion,
		projectOptions,
		projectPath,
		rojoConfigPath,
	};
}

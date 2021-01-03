import ts from "byots";
import fs from "fs-extra";
import path from "path";
import { createNodeModulesPathMapping } from "Project/functions/createNodeModulesPathMapping";
import { RojoResolver } from "Shared/classes/RojoResolver";
import { NODE_MODULES, RBXTS_SCOPE } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { ProjectData, ProjectFlags, ProjectOptions } from "Shared/types";

const DEFAULT_PROJECT_OPTIONS: ProjectOptions = {
	includePath: "",
	rojo: undefined,
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

	const logStringChanges = flags.logStringChanges;
	const logTruthyChanges = flags.logTruthyChanges;
	const noInclude = flags.noInclude;

	// intentionally use || here for empty string case
	const includePath = path.resolve(projectOptions.includePath || path.join(projectPath, "include"));

	const nodeModulesPath = path.join(path.dirname(pkgJsonPath), NODE_MODULES, RBXTS_SCOPE);
	const nodeModulesPathMapping = createNodeModulesPathMapping(nodeModulesPath);

	let rojoConfigPath: string | undefined;
	if (projectOptions.rojo !== undefined) {
		if (projectOptions.rojo !== "") {
			rojoConfigPath = path.resolve(projectOptions.rojo);
		}
	} else {
		rojoConfigPath = RojoResolver.findRojoConfigFilePath(projectPath);
	}

	const writeOnlyChanged = flags.writeOnlyChanged;

	return {
		tsConfigPath,
		includePath,
		isPackage,
		logStringChanges,
		logTruthyChanges,
		noInclude,
		nodeModulesPath,
		nodeModulesPathMapping,
		pkgVersion,
		projectOptions,
		projectPath,
		rojoConfigPath,
		writeOnlyChanged,
	};
}

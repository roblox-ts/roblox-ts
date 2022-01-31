import { RojoResolver } from "@roblox-ts/rojo-resolver";
import fs from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { NODE_MODULES } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { ProjectData, ProjectFlags, ProjectOptions } from "Shared/types";
import ts from "typescript";

const PACKAGE_REGEX = /^@[a-z0-9-]*\//;
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

	const pkgJsonPath = ts.findPackageJson(projectPath, ts.sys as unknown as ts.LanguageServiceHost);
	if (!pkgJsonPath) {
		throw new ProjectError("Unable to find package.json");
	}

	let isPackage: boolean;
	let pkgVersion: string;
	try {
		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
		isPackage = PACKAGE_REGEX.test(pkgJson.name ?? "");
		pkgVersion = pkgJson.version;
	} catch (e) {
		// fs call errors if no pkgJson
		// assume not a package and no version
		isPackage = false;
		pkgVersion = "";
	}

	const logTruthyChanges = flags.logTruthyChanges;
	const noInclude = flags.noInclude;

	// intentionally use || here for empty string case
	const includePath = path.resolve(projectOptions.includePath || path.join(projectPath, "include"));

	const nodeModulesPath = path.join(path.dirname(pkgJsonPath), NODE_MODULES);

	let rojoConfigPath: string | undefined;
	if (projectOptions.rojo !== undefined) {
		if (projectOptions.rojo !== "") {
			rojoConfigPath = path.resolve(projectOptions.rojo);
		}
	} else {
		const { path, warnings } = RojoResolver.findRojoConfigFilePath(projectPath);
		rojoConfigPath = path;
		for (const warning of warnings) {
			LogService.warn(warning);
		}
	}

	const writeOnlyChanged = flags.writeOnlyChanged;
	const watch = flags.watch;

	return {
		tsConfigPath,
		includePath,
		isPackage,
		logTruthyChanges,
		noInclude,
		nodeModulesPath,
		pkgVersion,
		projectOptions,
		projectPath,
		rojoConfigPath,
		writeOnlyChanged,
		watch,
	};
}

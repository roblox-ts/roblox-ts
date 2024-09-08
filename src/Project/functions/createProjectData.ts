import { RojoResolver } from "@roblox-ts/rojo-resolver";
import fs from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { NODE_MODULES } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { ProjectData, ProjectOptions } from "Shared/types";
import ts from "typescript";

const PACKAGE_REGEX = /^@[a-z0-9-]*\//;

export function createProjectData(tsConfigPath: string, projectOptions: ProjectOptions): ProjectData {
	const projectPath = path.dirname(tsConfigPath);

	const pkgJsonPath = ts.findPackageJson(projectPath, ts.sys as unknown as ts.LanguageServiceHost);
	if (!pkgJsonPath) {
		throw new ProjectError("Unable to find package.json");
	}

	let isPackage = false;
	try {
		const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath).toString());
		isPackage = PACKAGE_REGEX.test(pkgJson.name ?? "");
	} catch {
		// errors if no pkgJson, so assume not a package
	}

	// intentionally use || here for empty string case
	projectOptions.includePath = path.resolve(projectOptions.includePath || path.join(projectPath, "include"));

	const nodeModulesPath = path.join(path.dirname(pkgJsonPath), NODE_MODULES);

	let rojoConfigPath: string | undefined;
	// Checking truthiness covers empty string case
	if (projectOptions.rojo) {
		rojoConfigPath = path.resolve(projectOptions.rojo);
	} else {
		const { path, warnings } = RojoResolver.findRojoConfigFilePath(projectPath);
		rojoConfigPath = path;
		for (const warning of warnings) {
			LogService.warn(warning);
		}
	}

	return {
		tsConfigPath,
		isPackage,
		nodeModulesPath,
		projectOptions,
		projectPath,
		rojoConfigPath,
	};
}

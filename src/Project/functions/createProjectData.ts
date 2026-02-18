import { RojoResolver } from "@roblox-ts/rojo-resolver";
import fs from "fs-extra";
import path from "path";
import { LogService } from "Shared/classes/LogService";
import { NODE_MODULES } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { ProjectData, ProjectOptions, ReferencedProjectInfo } from "Shared/types";
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
		referencedProjects: collectProjectReferences(tsConfigPath, new Set(), projectOptions.luau),
	};
}

function collectProjectReferences(
	tsConfigPath: string,
	visited: Set<string>,
	luau: boolean,
): Array<ReferencedProjectInfo> {
	const normalizedPath = path.normalize(tsConfigPath);
	if (visited.has(normalizedPath)) {
		return [];
	}
	visited.add(normalizedPath);

	const parsed = parseProjectConfig(tsConfigPath);
	if (!parsed) {
		return [];
	}

	const results: Array<ReferencedProjectInfo> = [];

	for (const ref of parsed.references) {
		const refConfigPath = resolveReferencePath(tsConfigPath, ref.path);
		const refParsed = parseProjectConfig(refConfigPath);
		if (!refParsed) {
			continue;
		}

		results.push(...collectProjectReferences(refConfigPath, visited, luau), {
			tsConfigPath: refConfigPath,
			rootDir: refParsed.rootDir,
			outDir: refParsed.outDir,
		});
	}

	return results;
}

interface ParsedProjectReference {
	tsConfigPath: string;
	rootDir: string;
	outDir: string;
	references: ReadonlyArray<ts.ProjectReference>;
}

function parseProjectConfig(tsConfigPath: string): ParsedProjectReference | undefined {
	const configFile = ts.readConfigFile(tsConfigPath, ts.sys.readFile);
	if (configFile.error) {
		return undefined;
	}

	const configDir = path.dirname(tsConfigPath);
	const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, configDir);

	const rootDir = parsedConfig.options.rootDir ?? configDir;
	const outDir = parsedConfig.options.outDir ?? configDir;

	return {
		tsConfigPath,
		rootDir: path.resolve(configDir, rootDir),
		outDir: path.resolve(configDir, outDir),
		references: parsedConfig.projectReferences ?? [],
	};
}

function resolveReferencePath(fromConfigPath: string, refPath: string): string {
	const configDir = path.dirname(fromConfigPath);
	const resolvedPath = path.resolve(configDir, refPath);

	if (ts.sys.directoryExists(resolvedPath)) {
		return path.join(resolvedPath, "tsconfig.json");
	}

	return resolvedPath;
}

import path from "path";
import { getExtendedConfigPaths } from "Project/functions/getExtendedConfigPaths";
import { LogService } from "Shared/classes/LogService";
import { ProjectType } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectOptions } from "Shared/types";
import { createTextDiagnostic } from "Shared/util/createTextDiagnostic";
import { getCanonicalFileName } from "Shared/util/getCanonicalFileName";
import ts from "typescript";

const BOOLEAN_OPTIONS = new Set([
	"noInclude",
	"luau",
	"optimizedLoops",
	"allowCommentDirectives",
	"logTruthyChanges",
	"writeOnlyChanged",
	"writeTransformedFiles",
]);
const PATH_OPTIONS = new Set(["rojo", "includePath"]);

interface RawProjectConfig {
	extends?: string | Array<string>;
	rbxts?: unknown;
}

function readOwnOptions(configPath: string, value: unknown) {
	const options: Partial<ProjectOptions> = {};
	if (value === undefined) {
		return options;
	}

	const invalid = (message: string): never => {
		throw new DiagnosticError([
			createTextDiagnostic(`Invalid "rbxts" configuration in "${configPath}": ${message}`),
		]);
	};
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return invalid("expected an object");
	}

	for (const [key, setting] of Object.entries(value)) {
		if (BOOLEAN_OPTIONS.has(key)) {
			if (typeof setting !== "boolean") {
				invalid(`"${key}" must be a boolean`);
			}
			Object.assign(options, { [key]: setting });
		} else if (PATH_OPTIONS.has(key)) {
			if (typeof setting !== "string") {
				invalid(`"${key}" must be a string`);
			}
			Object.assign(options, { [key]: setting ? path.resolve(path.dirname(configPath), setting) : setting });
		} else if (key === "type") {
			if (!Object.values(ProjectType).includes(setting as ProjectType)) {
				invalid('"type" must be "game", "model", or "package"');
			}
			Object.assign(options, { type: setting });
		} else {
			LogService.warn(`Ignoring unsupported "rbxts" option "${key}" in "${configPath}".`);
		}
	}
	return options;
}

export function readProjectOptions(
	configPath: string,
	config: RawProjectConfig,
	cache = new Map<string, Partial<ProjectOptions>>(),
): Partial<ProjectOptions> {
	const key = getCanonicalFileName(path.normalize(configPath));
	const cached = cache.get(key);
	if (cached) {
		return cached;
	}

	const options: Partial<ProjectOptions> = {};
	for (const extendedPath of getExtendedConfigPaths(configPath, config.extends)) {
		const extended = ts.readConfigFile(extendedPath, ts.sys.readFile);
		if (extended.error) {
			throw new DiagnosticError([extended.error]);
		}
		Object.assign(options, readProjectOptions(extendedPath, extended.config, cache));
	}
	Object.assign(options, readOwnOptions(configPath, config.rbxts));
	cache.set(key, options);
	return options;
}

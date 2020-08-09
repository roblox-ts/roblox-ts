/* eslint-disable no-console */

import Ajv from "ajv";
import fs from "fs-extra";
import path from "path";
import { Lazy } from "Shared/classes/Lazy";
import { CLIENT_SUBEXT, INIT_NAME, LUA_EXT, MODULE_SUBEXT, PACKAGE_ROOT, SERVER_SUBEXT } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { isPathDescendantOf } from "Shared/fsUtil";
import { arrayStartsWith } from "Shared/util/arrayStartsWith";
import { warn } from "Shared/warn";
import { dir } from "console";

interface RojoTreeProperty {
	Type: string;
	Value: unknown;
}

interface RojoTreeMetadata {
	$className?: string;
	$path?: string;
	$properties?: Array<RojoTreeProperty>;
	$ignoreUnknownInstances?: boolean;
	$isolated?: boolean;
}

type RojoTree = RojoTreeMembers & RojoTreeMetadata;

interface RojoTreeMembers {
	[name: string]: RojoTree;
}

interface RojoFile {
	servePort?: number;
	name: string;
	tree: RojoTree;
}

const ajv = new Ajv();

const ROJO_FILE_REGEX = /^.+\.project\.json$/;
const ROJO_DEFAULT_NAME = "default.project.json";
const ROJO_OLD_NAME = "roblox-project.json";

const FOLDER_EXT = "";

export enum RbxType {
	ModuleScript,
	Script,
	LocalScript,
	Unknown,
}

const SUB_EXT_TYPE_MAP = new Map<string, RbxType>([
	[MODULE_SUBEXT, RbxType.ModuleScript],
	[SERVER_SUBEXT, RbxType.Script],
	[CLIENT_SUBEXT, RbxType.LocalScript],
]);

const DEFAULT_ISOLATED_CONTAINERS: Array<RbxPath> = [
	["StarterPack"],
	["StarterGui"],
	["StarterPlayer"],
	["StarterPlayer", "StarterPlayerScripts"],
	["StarterPlayer", "StarterCharacterScripts"],
	["StarterPlayer", "StarterCharacter"],
];

const CLIENT_CONTAINERS = [["StarterPack"], ["StarterGui"], ["StarterPlayer"]];
const SERVER_CONTAINERS = [["ServerStorage"], ["ServerScriptService"]];

/**
 * Represents a roblox tree path.
 */
export type RbxPath = Array<string>;
export type ReadonlyRbxPath = ReadonlyArray<string>;
export type RelativeRbxPath = Array<string | RbxPathParent>;

interface PartitionInfo {
	isFile: boolean;
	base: RbxPath;
	fsPath: string;
}

export enum FileRelation {
	OutToOut, // absolute
	OutToIn, // error
	InToOut, // absolute
	InToIn, // relative
}

export enum NetworkType {
	Unknown,
	Client,
	Server,
}

// does not use path.basename() intentionally!
function stripExts(filePath: string) {
	const ext = path.extname(filePath);
	if (ext.length > 0) {
		filePath = filePath.slice(0, -ext.length);
	}
	const subext = path.extname(filePath);
	if (subext.length > 0) {
		filePath = filePath.slice(0, -subext.length);
	}
	return filePath;
}

const SCHEMA_PATH = path.join(PACKAGE_ROOT, "rojo-schema.json");
const validateRojo = new Lazy(() => ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH).toString())));
function isValidRojoConfig(value: unknown): value is RojoFile {
	return validateRojo.get()(value) === true;
}

export const RbxPathParent = Symbol("Parent");
export type RbxPathParent = typeof RbxPathParent;

export class RojoResolver {
	public static findRojoConfigFilePath(projectPath: string) {
		const defaultPath = path.join(projectPath, ROJO_DEFAULT_NAME);
		if (fs.pathExistsSync(defaultPath)) {
			return defaultPath;
		}

		const candidates = new Array<string | undefined>();
		for (const fileName of fs.readdirSync(projectPath)) {
			if (fileName !== ROJO_DEFAULT_NAME && (fileName === ROJO_OLD_NAME || ROJO_FILE_REGEX.test(fileName))) {
				candidates.push(path.join(projectPath, fileName));
			}
		}

		if (candidates.length > 1) {
			warn(`Multiple *.project.json files found, using ${candidates[0]}`);
		}
		return candidates[0];
	}

	constructor(rojoConfigFilePath: string) {
		this.parseConfig(rojoConfigFilePath);
	}

	private rbxPath = new Array<string>();

	private parseConfig(rojoConfigFilePath: string) {
		if (fs.pathExistsSync(rojoConfigFilePath)) {
			let configJson: unknown;
			try {
				configJson = JSON.parse(fs.readFileSync(rojoConfigFilePath).toString());
			} catch (e) {}
			if (isValidRojoConfig(configJson)) {
				this.parseTree(path.dirname(rojoConfigFilePath), configJson.name, configJson.tree);
			} else {
				warn(`RojoResolver: Invalid configuration!`);
				console.log(validateRojo.get().errors);
			}
		} else {
			warn(`RojoResolver: Path does not exist "${rojoConfigFilePath}"`);
		}
	}

	private parseTree(basePath: string, name: string, tree: RojoTree) {
		this.rbxPath.push(name);

		console.log(this.rbxPath.join("."), tree.$path ?? tree.$className ?? "???");

		if (tree.$path) {
			this.parsePath(basePath, tree.$path);
		}

		for (const childName of Object.keys(tree).filter(v => !v.startsWith("$"))) {
			this.parseTree(basePath, childName, tree[childName]);
		}

		this.rbxPath.pop();
	}

	private parsePath(basePath: string, relativePath: string) {
		const itemPath = path.resolve(basePath, relativePath);
		if (fs.existsSync(itemPath) && fs.statSync(itemPath).isDirectory()) {
			this.searchDirectory(itemPath);
		}
	}

	private searchDirectory(directory: string) {
		const children = fs.readdirSync(directory);
		if (children.includes(ROJO_DEFAULT_NAME)) {
			this.parseConfig(path.join(directory, ROJO_DEFAULT_NAME));
			return;
		}
		for (const child of children) {
			const childPath = path.join(directory, child);
			if (fs.statSync(childPath).isDirectory()) {
				this.searchDirectory(childPath);
			}
		}
	}
}

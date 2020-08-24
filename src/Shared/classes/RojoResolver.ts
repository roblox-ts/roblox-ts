import Ajv from "ajv";
import fs from "fs-extra";
import path from "path";
import { Lazy } from "Shared/classes/Lazy";
import {
	CLIENT_SUBEXT,
	INIT_NAME,
	JSON_EXT,
	LUA_EXT,
	MODULE_SUBEXT,
	PACKAGE_ROOT,
	SERVER_SUBEXT,
} from "Shared/constants";
import { isPathDescendantOf } from "Shared/fsUtil";
import { arrayStartsWith } from "Shared/util/arrayStartsWith";
import { warn } from "Shared/warn";

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
export type RbxPath = ReadonlyArray<string>;
export type RelativeRbxPath = ReadonlyArray<string | RbxPathParent>;

interface PartitionInfo {
	rbxPath: RbxPath;
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

function stripRojoExts(filePath: string) {
	const ext = path.extname(filePath);
	if (ext === LUA_EXT) {
		filePath = filePath.slice(0, -ext.length);
		const subext = path.extname(filePath);
		if (subext === SERVER_SUBEXT || subext === CLIENT_SUBEXT) {
			filePath = filePath.slice(0, -subext.length);
		}
	} else if (ext === JSON_EXT) {
		filePath = filePath.slice(0, -ext.length);
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

	public static fromPath(rojoConfigFilePath: string, useFileSystem = true) {
		const resolver = new RojoResolver();
		resolver.fs = useFileSystem;
		resolver.parseConfig(path.resolve(rojoConfigFilePath), true);
		return resolver;
	}

	/**
	 * Create a synthetic RojoResolver for ProjectType.Package.
	 * Forces all imports to be relative.
	 */
	private fs = true;
	public static synthetic(projectDir: string, useFileSystem = true) {
		const resolver = new RojoResolver();
		resolver.fs = useFileSystem;
		resolver.parseTree(projectDir, "", { $path: projectDir } as RojoTree, true);
		return resolver;
	}

	private rbxPath = new Array<string>();
	private partitions = new Array<PartitionInfo>();
	private filePathToRbxPathMap = new Map<string, RbxPath>();
	private isolatedContainers = [...DEFAULT_ISOLATED_CONTAINERS];
	public isGame = false;

	private parseConfig(rojoConfigFilePath: string, doNotPush = false) {
		if (!this.fs) return;
		if (fs.pathExistsSync(rojoConfigFilePath)) {
			let configJson: unknown;
			try {
				configJson = JSON.parse(fs.readFileSync(rojoConfigFilePath).toString());
			} catch (e) {}
			if (isValidRojoConfig(configJson)) {
				this.parseTree(path.dirname(rojoConfigFilePath), configJson.name, configJson.tree, doNotPush);
			} else {
				warn(`RojoResolver: Invalid configuration! ${ajv.errorsText(validateRojo.get().errors)}`);
			}
		} else {
			warn(`RojoResolver: Path does not exist "${rojoConfigFilePath}"`);
		}
	}

	private parseTree(basePath: string, name: string, tree: RojoTree, doNotPush = false) {
		if (!doNotPush) this.rbxPath.push(name);

		if (tree.$path) {
			this.parsePath(path.resolve(basePath, tree.$path));
		}

		if (tree.$className === "DataModel") {
			this.isGame = true;
		}

		for (const childName of Object.keys(tree).filter(v => !v.startsWith("$"))) {
			this.parseTree(basePath, childName, tree[childName]);
		}

		if (!doNotPush) this.rbxPath.pop();
	}

	private parsePath(itemPath: string) {
		if (path.extname(itemPath) === LUA_EXT) {
			this.filePathToRbxPathMap.set(itemPath, [...this.rbxPath]);
		} else {
			if (
				this.fs &&
				fs.pathExistsSync(itemPath) &&
				fs.statSync(itemPath).isDirectory() &&
				fs.readdirSync(itemPath).includes(ROJO_DEFAULT_NAME)
			) {
				this.parseConfig(path.join(itemPath, ROJO_DEFAULT_NAME), true);
			} else {
				this.partitions.unshift({
					fsPath: itemPath,
					rbxPath: [...this.rbxPath],
				});

				if (this.fs && fs.pathExistsSync(itemPath)) {
					this.searchDirectory(itemPath);
				}
			}
		}
	}

	private searchDirectory(directory: string, item?: string) {
		const children = fs.readdirSync(directory);

		if (children.includes(ROJO_DEFAULT_NAME)) {
			this.parseConfig(path.join(directory, ROJO_DEFAULT_NAME));
			return;
		}

		if (item) this.rbxPath.push(item);

		// *.project.json
		for (const child of children) {
			const childPath = path.join(directory, child);
			if (fs.statSync(childPath).isFile() && child !== ROJO_DEFAULT_NAME && ROJO_FILE_REGEX.test(child)) {
				this.parseConfig(childPath);
			}
		}

		// folders
		for (const child of children) {
			const childPath = path.join(directory, child);
			if (fs.statSync(childPath).isDirectory()) {
				this.searchDirectory(childPath, child);
			}
		}

		if (item) this.rbxPath.pop();
	}

	public getRbxPathFromFilePath(filePath: string): RbxPath | undefined {
		filePath = path.resolve(filePath);
		const rbxPath = this.filePathToRbxPathMap.get(filePath);
		if (rbxPath) {
			return rbxPath;
		}
		for (const partition of this.partitions) {
			if (isPathDescendantOf(filePath, partition.fsPath)) {
				const stripped = stripRojoExts(filePath);
				const relativePath = path.relative(partition.fsPath, stripped);
				const relativeParts = relativePath === "" ? [] : relativePath.split(path.sep);
				if (relativeParts[relativeParts.length - 1] === INIT_NAME) {
					relativeParts.pop();
				}
				return partition.rbxPath.concat(relativeParts);
			}
		}
	}

	public getRbxTypeFromFilePath(filePath: string): RbxType {
		const subext = path.extname(path.basename(filePath, path.extname(filePath)));
		return SUB_EXT_TYPE_MAP.get(subext) ?? RbxType.Unknown;
	}

	private getContainer(from: Array<RbxPath>, rbxPath?: RbxPath) {
		if (this.isGame) {
			if (rbxPath) {
				for (const container of from) {
					if (arrayStartsWith(rbxPath, container)) {
						return container;
					}
				}
			}
		}
	}

	public getFileRelation(fileRbxPath: RbxPath, moduleRbxPath: RbxPath): FileRelation {
		const fileContainer = this.getContainer(this.isolatedContainers, fileRbxPath);
		const moduleContainer = this.getContainer(this.isolatedContainers, moduleRbxPath);
		if (fileContainer && moduleContainer) {
			if (fileContainer === moduleContainer) {
				return FileRelation.InToIn;
			} else {
				return FileRelation.OutToIn;
			}
		} else if (fileContainer && !moduleContainer) {
			return FileRelation.InToOut;
		} else if (!fileContainer && moduleContainer) {
			return FileRelation.OutToIn;
		} else {
			// !fileContainer && !moduleContainer
			return FileRelation.OutToOut;
		}
	}

	public isIsolated(rbxPath: RbxPath) {
		return this.getContainer(this.isolatedContainers, rbxPath) !== undefined;
	}

	public getNetworkType(rbxPath: RbxPath): NetworkType {
		if (this.getContainer(SERVER_CONTAINERS, rbxPath)) {
			return NetworkType.Server;
		}
		if (this.getContainer(CLIENT_CONTAINERS, rbxPath)) {
			return NetworkType.Client;
		}
		return NetworkType.Unknown;
	}

	public static relative(rbxFrom: RbxPath, rbxTo: RbxPath): RelativeRbxPath {
		const maxLength = Math.max(rbxFrom.length, rbxTo.length);
		let diffIndex = maxLength;
		for (let i = 0; i < maxLength; i++) {
			if (rbxFrom[i] !== rbxTo[i]) {
				diffIndex = i;
				break;
			}
		}

		const result = new Array<string | RbxPathParent>();
		if (diffIndex < rbxFrom.length) {
			for (let i = 0; i < rbxFrom.length - diffIndex; i++) {
				result.push(RbxPathParent);
			}
		}

		for (let i = diffIndex; i < rbxTo.length; i++) {
			result.push(rbxTo[i]);
		}

		return result;
	}
}

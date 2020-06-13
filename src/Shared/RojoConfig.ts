import Ajv from "ajv";
import fs from "fs-extra";
import path from "path";
import { CLIENT_SUBEXT, INIT_NAME, LUA_EXT, MODULE_SUBEXT, SERVER_SUBEXT } from "Shared/constants";
import { ProjectError } from "Shared/errors/ProjectError";
import { isPathDescendantOf } from "Shared/fsUtil";
import { arrayStartsWith } from "Shared/util/arrayStartsWith";
import { warn } from "Shared/warn";
import { Lazy } from "Shared/classes/Lazy";

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

const SCHEMA_PATH = path.join(__dirname, "..", "..", "rojo-schema.json");
const validateRojo = new Lazy(() => ajv.compile(JSON.parse(fs.readFileSync(SCHEMA_PATH).toString())));
function isValidRojoConfig(value: unknown): value is RojoFile {
	return validateRojo.get()(value) === true;
}

export const RbxPathParent = Symbol("Parent");
export type RbxPathParent = typeof RbxPathParent;

/**
 * Represents the Rojo configuration.
 */
export class RojoConfig {
	private readonly basePath: string;

	private partitions = new Array<PartitionInfo>();
	private isolatedContainers = [...DEFAULT_ISOLATED_CONTAINERS];

	private tree: RojoTree;

	private parseTree(tree: RojoTree, rbxPath: RbxPath) {
		if (tree.$path) {
			const ext = path.extname(tree.$path);
			if (ext === LUA_EXT || ext === FOLDER_EXT) {
				this.partitions.push({
					base: [...rbxPath],
					fsPath: path.resolve(this.basePath, tree.$path),
					isFile: ext === LUA_EXT,
				});
			}
		}

		if (tree.$isolated === true) {
			this.isolatedContainers.push([...rbxPath]);
		}

		for (const childName of Object.keys(tree).filter(v => !v.startsWith("$"))) {
			rbxPath.push(childName);
			this.parseTree(tree[childName], rbxPath);
			rbxPath.pop();
		}
	}

	private constructor(basePath: string, config: RojoFile) {
		this.basePath = basePath;
		this.tree = config.tree;
		this.parseTree(this.tree, []);
	}

	public static findRojoConfigFilePath(projectPath: string, rojoOverridePath?: string) {
		if (rojoOverridePath) {
			if (fs.pathExistsSync(rojoOverridePath)) {
				return rojoOverridePath;
			}
		} else {
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
	}

	public static fromPath(rojoPath: string) {
		if (!path.isAbsolute(rojoPath)) {
			rojoPath = path.resolve(rojoPath);
		}
		if (fs.pathExistsSync(rojoPath)) {
			const objectJson = JSON.parse(fs.readFileSync(rojoPath).toString());
			if (isValidRojoConfig(objectJson)) {
				return new RojoConfig(path.resolve(rojoPath, ".."), objectJson);
			} else {
				throw new ProjectError("Invalid Rojo configuration!\n" + JSON.stringify(validateRojo.get().errors));
			}
		} else {
			throw new ProjectError(`${rojoPath} is not a valid path!`);
		}
	}

	/**
	 * Create a synthetic RojoConfig for ProjectType.Package.
	 * Forces all imports to be relative.
	 */
	public static synthetic(projectDir: string) {
		return new RojoConfig(projectDir, { name: "", tree: { $path: projectDir } as RojoTree });
	}

	public getRbxPathFromFilePath(filePath: string) {
		if (!path.isAbsolute(filePath)) {
			filePath = path.resolve(this.basePath, filePath);
		}
		for (const partition of this.partitions) {
			if (partition.isFile) {
				if (partition.fsPath === filePath) {
					return [...partition.base];
				}
			} else {
				if (isPathDescendantOf(filePath, partition.fsPath)) {
					const stripped = stripExts(filePath);
					const relativePath = path.relative(partition.fsPath, stripped);
					const relativeParts = relativePath === "" ? [] : relativePath.split(path.sep);
					if (relativeParts[relativeParts.length - 1] === INIT_NAME) {
						relativeParts.pop();
					}
					return partition.base.concat(relativeParts);
				}
			}
		}
	}

	public getRbxTypeFromFilePath(filePath: string): RbxType {
		const subext = path.extname(path.basename(filePath, path.extname(filePath))).slice(1);
		return SUB_EXT_TYPE_MAP.get(subext) ?? RbxType.Unknown;
	}

	public isGame() {
		return this.tree.$className === "DataModel";
	}

	private getContainer(from: Array<RbxPath>, rbxPath?: RbxPath) {
		if (this.isGame()) {
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

	public static relative(rbxFrom: ReadonlyRbxPath, rbxTo: ReadonlyRbxPath) {
		const maxLength = Math.max(rbxFrom.length, rbxTo.length);
		let diffIndex = maxLength;
		for (let i = 0; i < maxLength; i++) {
			if (rbxFrom[i] !== rbxTo[i]) {
				diffIndex = i;
				break;
			}
		}

		const result: RelativeRbxPath = new Array<string | RbxPathParent>();
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

import Ajv from "ajv";
import fs from "fs-extra";
import path from "path";
import { RojoProjectError } from "./errors/RojoProjectError";
import { arrayStartsWith, isPathAncestorOf, stripExts } from "./utility/general";

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

const ROJO_METADATA_REGEX = /^\$/;
const LUA_EXT = ".lua";
const FOLDER_EXT = "";

const SUB_EXT_TYPE_MAP = new Map<string, string>([
	["", "ModuleScript"],
	[".server", "Script"],
	[".client", "LocalScript"],
]);

const DEFAULT_ISOLATED_CONTAINERS = [
	["StarterPack"],
	["StarterGui"],
	["StarterPlayer", "StarterPlayerScripts"],
	["StarterPlayer", "StarterCharacterScripts"],
	["StarterPlayer", "StarterCharacter"],
];

const CLIENT_CONTAINERS = [["StarterPack"], ["StarterGui"], ["StarterPlayer"]];
const SERVER_CONTAINERS = [["ServerStorage"], ["ServerScriptService"]];

interface RbxPath {
	isFile: boolean;
	base: ReadonlyArray<string>;
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

export class RojoProject {
	private readonly basePath: string;

	private partitions = new Array<RbxPath>();
	private isolatedContainers = [...DEFAULT_ISOLATED_CONTAINERS];

	private tree: RojoTree;

	private parseTree(tree: RojoTree, rbxPath: Array<string>) {
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

		for (const childName of Object.keys(tree).filter(v => !ROJO_METADATA_REGEX.test(v))) {
			rbxPath.push(childName);
			this.parseTree(tree[childName], rbxPath);
			rbxPath.pop();
		}
	}

	private constructor(basePath: string, config: RojoFile) {
		this.basePath = basePath;
		this.tree = config.tree;
		this.parseTree(config.tree, []);
	}

	public static validateRojo: Ajv.ValidateFunction | undefined;

	public static async fromPath(rojoPath: string) {
		if (!path.isAbsolute(rojoPath)) {
			rojoPath = path.resolve(rojoPath);
		}
		if (await fs.pathExists(rojoPath)) {
			if (!this.validateRojo) {
				this.validateRojo = ajv.compile(
					JSON.parse((await fs.readFile(path.join(__dirname, "..", "rojo-schema.json"))).toString()),
				);
			}

			const objectJson = JSON.parse((await fs.readFile(rojoPath)).toString());
			if (this.validateRojo(objectJson)) {
				return new RojoProject(path.resolve(rojoPath, ".."), objectJson);
			} else {
				throw new RojoProjectError("Invalid Rojo configuration!\n" + JSON.stringify(this.validateRojo.errors));
			}
		} else {
			throw new RojoProjectError(`${rojoPath} is not a valid path!`);
		}
	}

	public static fromPathSync(rojoPath: string) {
		if (!path.isAbsolute(rojoPath)) {
			rojoPath = path.resolve(rojoPath);
		}
		if (fs.pathExistsSync(rojoPath)) {
			if (!this.validateRojo) {
				this.validateRojo = ajv.compile(
					JSON.parse(fs.readFileSync(path.join(__dirname, "..", "rojo-schema.json")).toString()),
				);
			}

			const objectJson = JSON.parse(fs.readFileSync(rojoPath).toString());
			if (this.validateRojo(objectJson)) {
				return new RojoProject(path.resolve(rojoPath, ".."), objectJson);
			} else {
				throw new RojoProjectError("Invalid Rojo configuration!\n" + JSON.stringify(this.validateRojo.errors));
			}
		} else {
			throw new RojoProjectError(`${rojoPath} is not a valid path!`);
		}
	}

	public static async cwd() {
		return this.fromPath(process.cwd());
	}

	private getRbxPathFromFile(filePath: string) {
		if (!path.isAbsolute(filePath)) {
			filePath = path.resolve(this.basePath, filePath);
		}
		for (const partition of this.partitions) {
			if (partition.isFile) {
				if (partition.fsPath === filePath) {
					return [...partition.base];
				}
			} else {
				if (isPathAncestorOf(partition.fsPath, filePath)) {
					const relative = path.relative(partition.fsPath, stripExts(filePath)).split(path.sep);
					if (relative[relative.length - 1] === "init") {
						relative.pop();
					}
					return partition.base.concat(relative);
				}
			}
		}
	}

	public getRbxFromFile(filePath: string) {
		const subext = path.extname(path.basename(filePath, path.extname(filePath)));
		return {
			path: this.getRbxPathFromFile(filePath),
			type: SUB_EXT_TYPE_MAP.get(subext) || "Unknown",
		};
	}

	public isGame() {
		return this.tree.$className === "DataModel";
	}

	private getContainer(from: Array<Array<string>>, rbxPath?: Array<string>) {
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

	public getFileRelation(filePath: string, modulePath: string): FileRelation {
		const fileContainer = this.getContainer(this.isolatedContainers, this.getRbxPathFromFile(filePath));
		const moduleContainer = this.getContainer(this.isolatedContainers, this.getRbxPathFromFile(modulePath));
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

	public isIsolated(filePath: string) {
		return this.getContainer(this.isolatedContainers, this.getRbxPathFromFile(filePath)) !== undefined;
	}

	public getNetworkType(filePath: string): NetworkType {
		const rbxPath = this.getRbxPathFromFile(filePath);
		if (this.getContainer(SERVER_CONTAINERS, rbxPath)) {
			return NetworkType.Server;
		}
		if (this.getContainer(CLIENT_CONTAINERS, rbxPath)) {
			return NetworkType.Client;
		}
		return NetworkType.Unknown;
	}

	public static relative(rbxFrom: ReadonlyArray<string>, rbxTo: ReadonlyArray<string>) {
		const maxLength = Math.max(rbxFrom.length, rbxTo.length);
		let diffIndex = maxLength;
		for (let i = 0; i < maxLength; i++) {
			if (rbxFrom[i] !== rbxTo[i]) {
				diffIndex = i;
				break;
			}
		}

		const result = new Array<string>();
		if (diffIndex < rbxFrom.length) {
			for (let i = 0; i < rbxFrom.length - diffIndex; i++) {
				result.push("..");
			}
		}

		for (let i = diffIndex; i < rbxTo.length; i++) {
			result.push(rbxTo[i]);
		}

		return result;
	}
}

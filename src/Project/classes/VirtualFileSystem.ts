import { assert } from "Shared/util/assert";
import { getOrSetDefault } from "Shared/util/getOrSetDefault";

interface VirtualFile {
	name: string;
	content: string;
}

interface VirtualDirectory {
	name: string;
	children: Map<string, VirtualDirectory | VirtualFile>;
}

const PATH_SEP = "/";

export class VirtualFileSystem {
	private root: VirtualDirectory;

	constructor() {
		this.root = {
			name: "",
			children: new Map(),
		};
	}

	private getPathParts(filePath: string) {
		return filePath.split(PATH_SEP).filter(v => v.length > 0);
	}

	public writeFile(filePath: string, content: string) {
		const pathParts = this.getPathParts(filePath);
		const fileName = pathParts.pop()!;

		let currentDir = this.root;
		for (const name of pathParts) {
			const child = getOrSetDefault(currentDir.children, name, () => ({
				name,
				children: new Map(),
			}));
			assert("children" in child);
			currentDir = child;
		}

		assert(!currentDir.children.has(fileName));
		currentDir.children.set(fileName, {
			name: fileName,
			content,
		});
	}

	private get(itemPath: string) {
		const pathParts = this.getPathParts(itemPath);
		const fileName = pathParts.pop()!;

		let currentDir = this.root;
		for (const name of pathParts) {
			const child = currentDir.children.get(name);
			if (!child) return undefined;
			if (!("children" in child)) return undefined;
			currentDir = child;
		}

		return currentDir.children.get(fileName);
	}

	public readFile(filePath: string) {
		const item = this.get(filePath);
		if (item && "content" in item) {
			return item.content;
		}
	}

	public fileExists(filePath: string) {
		const item = this.get(filePath);
		return item !== undefined && "content" in item;
	}

	public directoryExists(dirPath: string) {
		const item = this.get(dirPath);
		return item !== undefined && "children" in item;
	}

	public getFilePaths() {
		const filePaths = new Array<string>();

		const search = (dir: VirtualDirectory, partialPath = "") => {
			for (const [name, child] of dir.children) {
				if ("children" in child) {
					search(child, `${partialPath}/${name}`);
				} else {
					filePaths.push(`${partialPath}/${name}`);
				}
			}
		};
		search(this.root);

		return filePaths;
	}
}

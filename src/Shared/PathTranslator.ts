import path from "path";
import { D_EXT, INDEX_NAME, INIT_NAME, LUA_EXT, TSX_EXT, TS_EXT, TS_REGEX } from "Shared/constants";
import { assert } from "Shared/util/assert";

class PathInfo {
	private constructor(public dirName: string, public fileName: string, public exts: Array<string>) {}

	public static from(filePath: string) {
		const dirName = path.dirname(filePath);
		const exts = filePath.slice(dirName.length + path.sep.length).split(".");
		const fileName = exts.shift();
		assert(fileName);
		return new PathInfo(dirName, fileName, exts);
	}

	public extsPeek(depth = 0): string | undefined {
		return this.exts[this.exts.length - (depth + 1)];
	}

	public join(): string {
		return path.join(this.dirName, [this.fileName, ...this.exts].join("."));
	}
}

export class PathTranslator {
	constructor(private readonly rootDir: string, private readonly outDir: string) {}

	private makeRelativeFactory(from = this.rootDir, to = this.outDir) {
		return (pathInfo: PathInfo) => path.join(to, path.relative(from, pathInfo.join()));
	}

	/**
	 * Maps an input path to an output path
	 * - `.tsx?` && !`.d.tsx?` -> `.lua`
	 * 	- `index` -> `init`
	 * - `src/*` -> `out/*`
	 */
	public getOutputPath(filePath: string) {
		const makeRelative = this.makeRelativeFactory();
		const pathInfo = PathInfo.from(filePath);

		if (TS_REGEX.test(pathInfo.extsPeek() ?? "") && pathInfo.extsPeek(1) !== D_EXT) {
			pathInfo.exts.pop(); // pop .tsx?

			// index -> init
			if (pathInfo.fileName === INDEX_NAME) {
				pathInfo.fileName = INIT_NAME;
			}

			pathInfo.exts.push(LUA_EXT);
		}

		return makeRelative(pathInfo);
	}

	/**
	 * Maps an output path to possible import paths
	 * - `.lua` -> `.tsx?`
	 * 	- `init` -> `index`
	 * - `out/*` -> `src/*`
	 */
	public getInputPaths(filePath: string) {
		const makeRelative = this.makeRelativeFactory(this.outDir, this.rootDir);
		const possiblePaths = new Array<string>();
		const pathInfo = PathInfo.from(filePath);

		if (pathInfo.extsPeek() === LUA_EXT) {
			pathInfo.exts.pop();

			const originalFileName = pathInfo.fileName;

			// init -> index
			if (pathInfo.fileName === INIT_NAME) {
				pathInfo.fileName = INDEX_NAME;
			}

			// .ts
			pathInfo.exts.push(TS_EXT);
			possiblePaths.push(makeRelative(pathInfo));
			pathInfo.exts.pop();

			// .tsx
			pathInfo.exts.push(TSX_EXT);
			possiblePaths.push(makeRelative(pathInfo));
			pathInfo.exts.pop();

			pathInfo.fileName = originalFileName;
		}

		possiblePaths.push(makeRelative(pathInfo));
		return possiblePaths;
	}

	/**
	 * Maps a src path to an import path
	 * - `.d.tsx?` -> `.tsx?` -> `.lua`
	 * 	- `index` -> `init`
	 */
	public getImportPath(filePath: string) {
		const makeRelative = this.makeRelativeFactory();
		const pathInfo = PathInfo.from(filePath);

		if (TS_REGEX.test(pathInfo.extsPeek() ?? "") && pathInfo.extsPeek(1) === D_EXT) {
			pathInfo.exts.pop(); // pop .tsx?
			pathInfo.exts.pop(); // pop .d

			// index -> init
			if (pathInfo.fileName === INDEX_NAME) {
				pathInfo.fileName = INIT_NAME;
			}

			pathInfo.exts.push(LUA_EXT); // push .lua
		}

		return makeRelative(pathInfo);
	}
}

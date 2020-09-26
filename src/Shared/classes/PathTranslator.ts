import path from "path";
import { D_EXT, INDEX_NAME, INIT_NAME, LUA_EXT, TSX_EXT, TS_EXT } from "Shared/constants";
import { assert } from "Shared/util/assert";

class PathInfo {
	private constructor(public dirName: string, public fileName: string, public exts: Array<string>) {}

	public static from(filePath: string) {
		const dirName = path.dirname(filePath);
		const parts = filePath.slice(dirName.length + path.sep.length).split(".");
		const fileName = parts.shift();
		const exts = parts.map(v => "." + v);
		assert(fileName !== undefined);
		return new PathInfo(dirName, fileName, exts);
	}

	public extsPeek(depth = 0): string | undefined {
		return this.exts[this.exts.length - (depth + 1)];
	}

	public join(): string {
		return path.join(this.dirName, [this.fileName, ...this.exts].join(""));
	}
}

export class PathTranslator {
	constructor(
		public readonly rootDir: string,
		public readonly outDir: string,
		public readonly buildInfoOutputPath: string | undefined,
		public readonly declaration: boolean,
	) {}

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

		if ((pathInfo.extsPeek() === TS_EXT || pathInfo.extsPeek() === TSX_EXT) && pathInfo.extsPeek(1) !== D_EXT) {
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

		// index.*.lua cannot come from a .ts file
		if (pathInfo.extsPeek() === LUA_EXT && pathInfo.fileName !== INDEX_NAME) {
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
			pathInfo.exts.push(LUA_EXT);
		}

		if (this.declaration) {
			if ((pathInfo.extsPeek() === TS_EXT || pathInfo.extsPeek() === TSX_EXT) && pathInfo.extsPeek(1) === D_EXT) {
				const tsExt = pathInfo.exts.pop(); // pop .tsx?
				assert(tsExt);
				pathInfo.exts.pop(); // pop .d

				// .ts
				pathInfo.exts.push(TS_EXT);
				possiblePaths.push(makeRelative(pathInfo));
				pathInfo.exts.pop();

				// .tsx
				pathInfo.exts.push(TSX_EXT);
				possiblePaths.push(makeRelative(pathInfo));
				pathInfo.exts.pop();

				pathInfo.exts.push(D_EXT);
				pathInfo.exts.push(tsExt);
			}
		}

		possiblePaths.push(makeRelative(pathInfo));
		return possiblePaths;
	}

	/**
	 * Maps a src path to an import path
	 * - `.d.tsx?` -> `.tsx?` -> `.lua`
	 * 	- `index` -> `init`
	 */
	public getImportPath(filePath: string, isNodeModule = false) {
		const makeRelative = this.makeRelativeFactory();
		const pathInfo = PathInfo.from(filePath);

		if (pathInfo.extsPeek() === TS_EXT || pathInfo.extsPeek() === TSX_EXT) {
			pathInfo.exts.pop(); // pop .tsx?
			if (pathInfo.extsPeek() === D_EXT) {
				pathInfo.exts.pop(); // pop .d
			}

			// index -> init
			if (pathInfo.fileName === INDEX_NAME) {
				pathInfo.fileName = INIT_NAME;
			}

			pathInfo.exts.push(LUA_EXT); // push .lua
		}

		return isNodeModule ? pathInfo.join() : makeRelative(pathInfo);
	}
}

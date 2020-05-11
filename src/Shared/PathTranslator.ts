import path from "path";
import { TS_EXT, D_EXT } from "Shared/constants";

export class PathTranslator {
	constructor(private readonly rootDir: string, private readonly outDir: string) {}

	private getFileExtensions(filePath: string): Array<string> {
		const ext = path.extname(filePath);
		if (ext === "") {
			return [filePath];
		}
		return [...this.getFileExtensions(filePath.slice(0, -ext.length)), ext];
	}

	public getOutPath(filePath: string) {
		const filename = path.basename(filePath);
		const directory = filePath.slice(0, -filename.length);
		const extensions = this.getFileExtensions(path.basename(filePath));
		if (extensions[extensions.length - 1] === TS_EXT) extensions.pop();
		// .d.ts does not get compiled or outputted, so will not get an outpath. why check for it?
		if (extensions[extensions.length - 1] === D_EXT) extensions.pop();
		if (extensions[0] === "index") {
			extensions[0] = "init";
		}

		filePath = path.join(directory, extensions.join());
		const relativeToRoot = path.relative(this.rootDir, filePath);
		return path.join(this.outDir, relativeToRoot + ".lua");
	}
}

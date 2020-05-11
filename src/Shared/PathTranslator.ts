import path from "path";
import { TS_EXT, D_EXT } from "Shared/constants";

export class PathTranslator {
	constructor(private readonly rootDir: string, private readonly outDir: string) {}

	public getOutPath(filePath: string) {
		const ext = path.extname(filePath);
		if (ext === TS_EXT) filePath = filePath.slice(0, -ext.length);
		const subExt = path.extname(filePath);
		if (subExt === D_EXT) filePath = filePath.slice(0, -subExt.length);

		const relativeToRoot = path.relative(this.rootDir, filePath);
		return path.join(this.outDir, relativeToRoot + ".lua");
	}
}

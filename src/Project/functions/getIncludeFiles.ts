import fs from "fs-extra";
import path from "path";
import { INCLUDE_PATH } from "Shared/constants";
import { ProjectOptions } from "Shared/types";

export function getIncludeFiles(options: ProjectOptions) {
	const files = new Array<{ input: string; output: string }>();
	const visit = (directory: string) => {
		for (const name of fs.readdirSync(directory)) {
			const input = path.join(directory, name);
			if (fs.statSync(input).isDirectory()) {
				visit(input);
			} else {
				const relativePath = path.relative(INCLUDE_PATH, input);
				const outputName = options.luau ? relativePath : relativePath.replace(/\.luau$/, ".lua");
				files.push({ input, output: path.join(options.includePath, outputName) });
			}
		}
	};

	visit(INCLUDE_PATH);
	return files;
}

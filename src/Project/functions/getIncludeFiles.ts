import fs from "fs-extra";
import path from "path";
import { INCLUDE_PATH, LUA_EXT, LUAU_EXT } from "Shared/constants";
import { ProjectOptions } from "Shared/types";

export function getIncludeFiles(options: ProjectOptions) {
	const files = new Array<{ input: string; output: string }>();
	const visit = (directory: string) => {
		for (const name of fs.readdirSync(directory)) {
			const input = path.join(directory, name);
			if (fs.statSync(input).isDirectory()) {
				visit(input);
			} else {
				let outputName = path.relative(INCLUDE_PATH, input);
				if (!options.luau && outputName.endsWith(LUAU_EXT)) {
					outputName = outputName.slice(0, -LUAU_EXT.length) + LUA_EXT;
				}

				files.push({ input, output: path.join(options.includePath, outputName) });
			}
		}
	};

	visit(INCLUDE_PATH);
	return files;
}

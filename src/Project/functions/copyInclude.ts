import fs from "fs-extra";
import { getIncludeFiles } from "Project/functions/getIncludeFiles";
import { LUA_EXT, LUAU_EXT, ProjectType } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyInclude(data: ProjectData) {
	if (
		!data.projectOptions.noInclude &&
		data.projectOptions.type !== ProjectType.Package &&
		!(data.projectOptions.type === undefined && data.isPackage)
	) {
		benchmarkIfVerbose("copy include files", () => {
			for (const { input, output } of getIncludeFiles(data.projectOptions)) {
				if (input.endsWith(LUAU_EXT)) {
					// Rojo must not see both extensions as competing instances after an option change
					const extension = data.projectOptions.luau ? LUAU_EXT : LUA_EXT;
					const alternateExtension = data.projectOptions.luau ? LUA_EXT : LUAU_EXT;
					const alternate = output.slice(0, -extension.length) + alternateExtension;
					if (fs.existsSync(alternate)) {
						fs.unlinkSync(alternate);
					}
				}
				fs.copySync(input, output, { dereference: true });
			}
		});
	}
}

import fs from "fs-extra";
import { getIncludeFiles } from "Project/functions/getIncludeFiles";
import { ProjectType } from "Shared/constants";
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
				if (input.endsWith(".luau")) {
					// Rojo must not see both extensions as competing instances after an option change
					const alternate = data.projectOptions.luau ? output.slice(0, -1) : `${output}u`;
					if (fs.existsSync(alternate)) {
						fs.unlinkSync(alternate);
					}
				}
				fs.copySync(input, output, { dereference: true });
			}
		});
	}
}

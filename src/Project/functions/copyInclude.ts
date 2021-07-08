import fs from "fs-extra";
import { LIB_PATH, ProjectType } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyInclude(data: ProjectData) {
	if (
		!data.noInclude &&
		data.projectOptions.type !== ProjectType.Package &&
		!(data.projectOptions.type === undefined && data.isPackage)
	) {
		benchmarkIfVerbose("copy include files", () => fs.copySync(LIB_PATH, data.includePath, { dereference: true }));
	}
}

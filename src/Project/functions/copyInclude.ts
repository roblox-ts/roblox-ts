import fs from "fs-extra";
import { ProjectData } from "Project/types";
import { LIB_PATH } from "Shared/constants";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyInclude(data: ProjectData) {
	if (!data.noInclude) {
		benchmarkIfVerbose("copy include files", () => fs.copySync(LIB_PATH, data.includePath, { dereference: true }));
	}
}

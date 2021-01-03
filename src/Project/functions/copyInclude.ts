import fs from "fs-extra";
import { LIB_PATH } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyInclude(data: ProjectData) {
	if (!data.noInclude) {
		benchmarkIfVerbose("copy include files", () => fs.copySync(LIB_PATH, data.includePath, { dereference: true }));
	}
}

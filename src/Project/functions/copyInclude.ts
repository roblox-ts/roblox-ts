import fs from "fs-extra";
import path from "path";
import { INCLUDE_PATH, ProjectType } from "Shared/constants";
import { ProjectData } from "Shared/types";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyInclude(data: ProjectData) {
	if (
		!data.projectOptions.noInclude &&
		data.projectOptions.type !== ProjectType.Package &&
		!(data.projectOptions.type === undefined && data.isPackage)
	) {
		benchmarkIfVerbose("copy include files", () => {
			for (const fileName of fs.readdirSync(INCLUDE_PATH)) {
				const fromPath = path.join(INCLUDE_PATH, fileName);
				const toPathLuau = path.join(data.projectOptions.includePath, fileName);
				const toPathLua = toPathLuau.replace(/\.luau$/, ".lua");
				if (data.projectOptions.luau) {
					if (fs.existsSync(toPathLua)) fs.unlinkSync(toPathLua);
					fs.copySync(fromPath, toPathLuau, { dereference: true });
				} else {
					if (fs.existsSync(toPathLuau)) fs.unlinkSync(toPathLuau);
					fs.copySync(fromPath, toPathLua, { dereference: true });
				}
			}
		});
	}
}

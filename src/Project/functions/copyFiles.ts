import ts from "byots";
import fs from "fs-extra";
import path from "path";
import { ProjectServices } from "Project/types";
import { assert } from "Shared/util/assert";
import { benchmarkIfVerbose } from "Shared/util/benchmark";

export function copyFiles(program: ts.BuilderProgram, services: ProjectServices, sources: Set<string>) {
	const compilerOptions = program.getCompilerOptions();
	benchmarkIfVerbose("copy non-compiled files", () => {
		assert(compilerOptions.outDir);
		for (const source of sources) {
			fs.copySync(
				source,
				path.join(compilerOptions.outDir, path.relative(services.pathTranslator.rootDir, source)),
				{
					filter: src => !src.endsWith(ts.Extension.Ts) && !src.endsWith(ts.Extension.Tsx),
					dereference: true,
				},
			);
		}
	});
}

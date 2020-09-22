import { describe } from "mocha";
import path from "path";
import {
	createProjectData,
	createProjectProgram,
	createProjectServices,
	getPreEmitInfo,
} from "Project/functions/bootstrap";
import { compileFiles, compileFile } from "Project/functions/compileFiles";
import { copyFiles } from "Project/functions/copyFiles";
import { copyInclude } from "Project/functions/copyInclude";
import { getChangedSourceFiles } from "Project/functions/getChangedSourceFiles";
import { getRootDirs } from "Project/functions/getRootDirs";
import { PACKAGE_ROOT } from "Shared/constants";
import { DiagnosticError } from "Shared/errors/DiagnosticError";
import { ProjectError } from "Shared/errors/ProjectError";

describe("should compile tests project", () => {
	const data = createProjectData(
		path.join(PACKAGE_ROOT, "tests", "tsconfig.json"),
		{},
		{
			noInclude: false,
			project: "",
			verbose: false,
			watch: false,
		},
	);
	const program = createProjectProgram(data);
	const services = createProjectServices(program, data);

	it("should copy include files", () => copyInclude(data));

	it("should copy non-compiled files", () => copyFiles(program, services, new Set(getRootDirs(program))));

	const { multiTransformState, rojoResolver, projectType, runtimeLibRbxPath, nodeModulesRbxPath } = getPreEmitInfo(
		data,
	);

	for (const sourceFile of getChangedSourceFiles(program)) {
		const fileName = path.relative(process.cwd(), sourceFile.fileName);
		it(`should compile ${fileName}`, done => {
			try {
				compileFile(
					program,
					data,
					services,
					sourceFile,
					multiTransformState,
					rojoResolver,
					projectType,
					runtimeLibRbxPath,
					nodeModulesRbxPath,
				);
				done();
			} catch (e) {
				if (e instanceof ProjectError || e instanceof DiagnosticError) {
					done(new Error("\n" + e.toString()));
				} else {
					done(e);
				}
			}
		});
	}
});

import { parentPort, workerData, threadId } from "worker_threads";
import { lightblue } from "../utility/text";
import { ProjectError, CompilerError, ProjectOptions, Project } from "..";

interface CompileFilesWorker {
	projectOptions: ProjectOptions;
	compileFiles: Array<string>;
}

function isCompileFilesWorker(data: {}): data is CompileFilesWorker {
	return "compileFiles" in data && "projectOptions" in data;
}
function workerLog(message: string) {
	console.log(`${lightblue(`* [worker ${threadId}]`)} ${message}`);
}

async function time(callback: () => Promise<void>) {
	const start = Date.now();
	try {
		await callback();
	} catch (e) {
		if (e instanceof ProjectError || e instanceof CompilerError) {
			process.exitCode = 0;
		} else {
			throw e;
		}
	}
	workerLog(`Task complete! took ${Date.now() - start} ms!`);
}

if (isCompileFilesWorker(workerData)) {
	const { compileFiles, projectOptions } = workerData;

	workerLog(`Starting compilation for ${compileFiles.length} files...`);
	time(async () => {
		const project = new Project(projectOptions);
		await project.compileFiles(compileFiles.map(f => project.getSourceFile(f)!));
	}).then(
		() => {
			parentPort?.postMessage({ type: "compileFiles", state: "completed", files: compileFiles.length });
		},
		() => {},
	);
}

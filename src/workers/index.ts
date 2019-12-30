import { Worker } from "worker_threads";
import { SourceFile } from "ts-morph";
import os from "os";
import { red, lightblue } from "../utility/text";
import { Project } from "..";

function createWorker(file: string, data: {}) {
	const worker = new Worker(file, { workerData: data });
	worker.on("error", err => console.log(red("ERROR:") + err));
	worker.on("message", () => {});
	return worker;
}

interface CompileFilesResult {
	type: "compileFiles";
	state: "completed";
	files: number;
}

function isCompileFilesResult(data: {}): data is CompileFilesResult {
	return "type" in data && "state" in data;
}

function log(message: string) {
	console.log(`${lightblue(`[roblox-ts]`)} ${message}`);
}

export function createFileCompilationWorkers(
	project: Project,
	sourceFiles: Array<SourceFile>,
	count = os.cpus().length - 1,
) {
	return new Promise((resolve, reject) => {
		const files = sourceFiles.map(v => v.getFilePath());
		let total = files.length;
		let offset = 0;
		const splitToCPUs = Math.ceil(files.length / count);
		const remainderFiles = files.length % splitToCPUs;

		log(`Starting compliation of ${total} files, allocated to ${count} threads.`);

		let completed = 0;
		for (let i = 0; i < count; i++) {
			const toSlice = total >= splitToCPUs ? splitToCPUs : remainderFiles;
			const compileFiles = files.slice(offset, offset + toSlice);
			const worker = createWorker(__dirname + "/worker.js", { compileFiles, projectOptions: project.opts });
			total -= toSlice;
			offset += toSlice;
			worker.on("message", data => {
				if (isCompileFilesResult(data)) {
					if (data.state === "completed") {
						completed++;
					}

					if (completed === count) {
						resolve();
					}
				}
			});
			worker.on("error", err => {
				reject(err);
			});
		}
	});
}

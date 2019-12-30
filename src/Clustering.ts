import { Project } from "./Project";
import cluster from "cluster";
import { ProjectError, CompilerError } from ".";
import { lightblue } from "./utility/text";
import os from "os";
// import { Worker, isMainThread , parentPort, workerData } from "worker_threads";

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
	ProjectClusterWorker.log(`Done, took ${Date.now() - start} ms!`);
}

interface CompileFiles {
	compileFiles: Array<string>;
}

function isCompileFilesMessage(data: {}): data is CompileFiles {
	return typeof data === "object" && "compileFiles" in data;
}

export namespace ProjectClusterMaster {
	const workers = new Array<cluster.Worker>();
	export function createWorkers(numWorkers = os.cpus().length) {
		console.log(lightblue(`roblox-ts - using ${numWorkers} threads (-m)`));
		for (let i = 0; i < numWorkers; i++) {
			workers.push(cluster.fork());
		}
	}

	export function forEachWorker(fn: (worker: cluster.Worker) => void) {
		for (const workerId of Object.keys(cluster.workers)) {
			fn(cluster.workers[workerId]!);
		}
	}

	function getWorkerCount() {
		let workerCount = 0;
		for (const _ of Object.keys(cluster.workers)) {
			workerCount++;
		}
		return workerCount;
	}

	export function multiCompileAll(filePaths: Array<string>) {
		const workerCount = getWorkerCount();
		let total = filePaths.length;
		let offset = 0;
		const splitToCPUs = Math.ceil(filePaths.length / workerCount);
		const remainderFiles = filePaths.length % splitToCPUs;
		forEachWorker(worker => {
			const toSlice = total >= splitToCPUs ? splitToCPUs : remainderFiles;
			const f = filePaths.slice(offset, offset + toSlice);
			worker.send({ compileFiles: f });
			total -= toSlice;
			offset += toSlice;
		});
	}
}

export class ProjectClusterWorker {
	private onMessage = async (data: {}) => {
		if (isCompileFilesMessage(data)) {
			ProjectClusterWorker.log(`Started compilation of ${data.compileFiles.length} files`);
			await time(async () => {
				await this.project.compileFiles(data.compileFiles.map(f => this.project.getSourceFile(f)!));
			});
		}
	};

	public static log(message: string) {
		console.log(`${lightblue(`[roblox-ts #${process.pid.toString()}]`)} ${message}`);
	}

	constructor(private project: Project) {
		if (cluster.isWorker) {
			ProjectClusterWorker.log("Worker started.");
			cluster.worker.on("message", this.onMessage);
		} else {
			throw `Tried creating a worker in master thread!`;
		}
	}
}

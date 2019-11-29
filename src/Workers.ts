import { Project } from "./Project";
import cluster from "cluster";
import { ProjectError, CompilerError } from ".";
import { lightblue } from "./utility/text";

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
	ProjectWorker.log(`Done, took ${Date.now() - start} ms!`);
}

interface CompileFiles {
	compileFiles: Array<string>;
}

function isCompileFilesMessage(data: {}): data is CompileFiles {
	return typeof data === "object" && "compileFiles" in data;
}

export class ProjectWorker {
	private onMessage = async (data: {}) => {
		if (isCompileFilesMessage(data)) {
			ProjectWorker.log(`Started compilation of ${data.compileFiles.length} files`);
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
			ProjectWorker.log("Worker started.");
			cluster.worker.on("message", this.onMessage);
		} else {
			throw `Tried creating a worker in master thread!`;
		}
	}
}

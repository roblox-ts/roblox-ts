import chokidar from "chokidar";
import { Project, ProjectOptions } from "Project";

interface WatchEvent {
	type: "change" | "add" | "unlink";
	itemPath: string;
}

const CHOKIDAR_OPTIONS: chokidar.WatchOptions = {
	awaitWriteFinish: {
		pollInterval: 10,
		stabilityThreshold: 50,
	},
	ignoreInitial: true,
	ignorePermissionErrors: true,
	interval: 100,
	usePolling: true,
};

export class Watcher {
	private project!: Project;
	private watchEventQueue = new Array<WatchEvent>();
	private hasUpdateAllSucceeded = false;

	constructor(private readonly tsConfigPath: string, private readonly opts: Partial<ProjectOptions>) {
		this.refreshProject();
		this.watch();
	}

	private refreshProject() {
		this.project = new Project(this.tsConfigPath, this.opts);
	}

	private async updateAll() {
		this.hasUpdateAllSucceeded = true;
	}

	private async update() {
		if (!this.hasUpdateAllSucceeded) {
			await this.updateAll();
			return;
		}
	}

	private async startProcessingQueue() {}

	private pushToQueue(event: WatchEvent) {
		this.watchEventQueue.push(event);
		void this.startProcessingQueue();
	}

	private watch() {
		chokidar
			.watch([this.project.rootDir], CHOKIDAR_OPTIONS)
			.on("addDir", itemPath => this.pushToQueue({ type: "add", itemPath }))
			.on("unlinkDir", itemPath => this.pushToQueue({ type: "unlink", itemPath }))
			.on("change", itemPath => this.pushToQueue({ type: "change", itemPath }))
			.on("add", itemPath => this.pushToQueue({ type: "add", itemPath }))
			.on("unlink", itemPath => this.pushToQueue({ type: "unlink", itemPath }));

		chokidar.watch(this.tsConfigPath, CHOKIDAR_OPTIONS).on("change", () => this.refreshProject());

		if (this.project.rojoFilePath) {
			chokidar.watch(this.project.rojoFilePath, CHOKIDAR_OPTIONS).on("change", () => this.refreshProject());
		}
	}
}

import { Project, ProjectOptions } from "../../TSProject";

export class Watcher {
	private project!: Project;

	constructor(private readonly tsConfigPath: string, private readonly opts: Partial<ProjectOptions>) {
		this.refreshProject();
	}

	private refreshProject() {
		this.project = new Project(this.tsConfigPath, this.opts);
	}
}

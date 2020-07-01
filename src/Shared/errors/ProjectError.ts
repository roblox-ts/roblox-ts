import kleur from "kleur";
import { LoggableError } from "Shared/errors/LoggableError";

export class ProjectError extends LoggableError {
	constructor(private message: string) {
		super();
	}

	public toString() {
		return kleur.red("Project Error:") + " " + this.message;
	}
}

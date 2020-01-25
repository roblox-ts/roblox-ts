import { LoggableError } from "./LoggableError";
import { warn } from "./Warning";

export class RojoProjectError extends LoggableError {
	public log() {
		warn(`Failed to load Rojo configuration. Import and export statements will not compile. ${this.message}`);
	}
}

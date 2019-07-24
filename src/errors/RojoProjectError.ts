import { LoggableError } from "./LoggableError";

export class RojoProjectError extends LoggableError {
	public log() {
		console.log(
			"Warning!",
			"Failed to load Rojo configuration. Import and export statements will not compile.",
			this.message,
		);
	}
}

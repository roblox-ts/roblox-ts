import kleur from "kleur";

export class LogService {
	public static verbose = false;
	private static partial = false;

	static write(message: string) {
		this.partial = !message.endsWith("\n");
		process.stdout.write(message);
	}

	static writeLine(...messages: Array<unknown>) {
		if (this.partial) {
			this.write("\n");
		}
		for (const message of messages) {
			this.write(message + "\n");
		}
	}

	static writeLineIfVerbose(...messages: Array<unknown>) {
		if (this.verbose) {
			this.writeLine(...messages);
		}
	}

	static warn(message: string) {
		this.writeLine(`${kleur.yellow("Compiler Warning:")} ${message}`);
	}
}

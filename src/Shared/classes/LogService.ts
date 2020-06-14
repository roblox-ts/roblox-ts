export class LogService {
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
}

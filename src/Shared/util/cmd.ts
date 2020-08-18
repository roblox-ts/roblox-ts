import { SpawnOptions } from "child_process";
import spawn from "cross-spawn";
export async function cmd(process: string, args: Array<string>, options?: SpawnOptions) {
	return new Promise<string>((resolve, reject) => {
		let output = "";
		spawn(process, args, options)
			.on("message", msg => (output += msg))
			.on("error", e => reject(e.message))
			.on("close", () => resolve(output));
	});
}

export function cmdSync(process: string, args: Array<string>, options?: SpawnOptions): Array<null | Buffer> {
	// types are incorrect, this actually returns Array<null | Buffer>
	return (spawn.sync(process, args, options).output as unknown) as Array<null | Buffer>;
}

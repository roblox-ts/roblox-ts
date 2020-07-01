import { LogService } from "Shared/classes/LogService";

function benchmarkStart(name: string) {
	LogService.write(`${name}`);
	return Date.now();
}

function benchmarkEnd(startTime: number) {
	LogService.write(` ( ${Date.now() - startTime} ms )\n`);
}

export function benchmarkSync(name: string, callback: () => void) {
	const startTime = benchmarkStart(name);
	callback();
	benchmarkEnd(startTime);
}

export async function benchmark<T>(name: string, callback: () => Promise<T>) {
	const startTime = benchmarkStart(name);
	await callback();
	benchmarkEnd(startTime);
}

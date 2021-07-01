export function cleanModuleName(name: string) {
	return name.replace(/\W/g, "_");
}

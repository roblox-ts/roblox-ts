export function cleanModuleName(name: string) {
	return name.replace(/[\~\-\.]/g, "_");
}

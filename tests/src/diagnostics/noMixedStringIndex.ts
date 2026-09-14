function read(value: string | Array<string>, index: number) {
	return value[index];
}

function readOptional(value: string | Array<string> | undefined) {
	return value?.[0];
}

function readGeneric<T extends string | { [index: number]: string }>(value: T) {
	return value[0];
}

function destructure(value: string | Array<string>) {
	const { 0: first } = value;
	return first;
}

function assign(value: string | Array<string>) {
	let first = "";
	({ 0: first } = value);
	return first;
}

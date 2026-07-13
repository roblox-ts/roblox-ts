interface HasMethod {
	method(a: string): void;
}

const obj: HasMethod = {
	method: a => {},
};

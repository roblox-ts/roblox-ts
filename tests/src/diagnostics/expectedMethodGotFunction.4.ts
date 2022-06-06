interface HasMethod {
	method(a: string): void;
}

const obj: HasMethod = {
	method(this: void, a) {},
};

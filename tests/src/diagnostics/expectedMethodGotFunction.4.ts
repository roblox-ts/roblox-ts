interface HasMethod {
	method(): void;
}

const obj: HasMethod = {
	method(this: void) {},
};

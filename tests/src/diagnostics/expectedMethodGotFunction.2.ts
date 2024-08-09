interface HasMethod {
	method: (this: HasMethod, a: string) => void;
}

const obj: HasMethod = {
	method: a => {},
};

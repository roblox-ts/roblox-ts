interface HasCallback {
	callback: (a: number) => void;
}

const obj: HasCallback = {
	callback(a) {},
};

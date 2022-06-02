interface HasCallback {
	callback: () => void;
}

const obj: HasCallback = {
	callback() {},
};

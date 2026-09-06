export {};

outer: for (const _ of [0]) {
	try {
		break outer;
	} catch (e) {}
}

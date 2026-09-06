export {};

outer: for (const _ of [0]) {
	try {
		continue outer;
	} catch (e) {}
}

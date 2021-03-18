export {};

label: do {
	for (const x of [1, 2, 3]) {
		break label;
	}
} while (false);

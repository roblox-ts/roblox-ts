for (const x of [1, 2, 3]) {
	// @ts-expect-error non-existent label
	break label;
}

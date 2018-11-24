let i: number;
let j: number;

loop1: for (i = 0; i < 3; i++) {
	// the first for statement is labeled "loop1"
	loop2: for (j = 0; j < 3; j++) {
		// the second for statement is labeled "loop2"
		if (i === 1 && j === 1) {
			continue loop1;
		}
	}
}

export {};

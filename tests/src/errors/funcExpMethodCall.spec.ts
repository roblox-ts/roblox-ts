export = () => {
	const o = {
		c: 1,

		a: function add(i: number): number {
			if (i === 0) {
				return 0;
			} else {
				return i + add(i - 1);
			}
		},
	};
};

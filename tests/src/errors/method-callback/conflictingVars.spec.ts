{
	let x = () => 1;
	x = function(this: {}) {
		return 2;
	};
}
export {};

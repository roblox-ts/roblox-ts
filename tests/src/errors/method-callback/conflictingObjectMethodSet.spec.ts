{
	const o = {
		f: function(this: {}) {},
	};

	o.f = () => {};
}
export {};

export = () => {
	it("should convert throw statements", () => {
		const doError = () => {
			throw "this function sucks";
		};

		expect(doError).to.throw();
	});
};

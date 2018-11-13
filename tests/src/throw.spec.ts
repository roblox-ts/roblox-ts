export = () => {
	function doError(): void {
		throw "this function sucks";
	}

	it("should convert throw statements", () => {
		expect(doError).to.throw();
	});
};

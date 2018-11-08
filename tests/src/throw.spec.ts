export = () => {
	function doError(): void {
		/* tslint:disable */
		throw "this function sucks";
		/* tslint:enable */
	}

	it("should convert throw statements", () => {
		expect(doError).to.throw();
	});
};

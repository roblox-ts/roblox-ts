export = () => {
	/* tslint:disable */
	function doError(): void {
		throw "this function sucks";
	}
	/* tslint:enable */

	it("should convert throw statements", () => {
		expect(doError).to.throw();
	});
};

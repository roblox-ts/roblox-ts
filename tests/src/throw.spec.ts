function doError(): void {
	throw "this function sucks";
}

export = () => {
	it("should convert throw statements", () => {
		expect(doError).to.throw();
	});
};

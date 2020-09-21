/// <reference types="@rbxts/testez/globals" />

export = () => {
	it("should properly fetch types with parenthesis and nonNull assertions", () => {
		function loop(array?: Array<number>) {
			let i = 0;
			// prettier-ignore
			for (const value of ((array)!)!) expect(value).to.equal(i++);
		}

		loop([0, 1, 2, 3]);
	});
};

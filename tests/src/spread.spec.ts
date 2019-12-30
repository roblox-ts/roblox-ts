export = () => {
	it("should work with prestatements and spreadable lists", () => {
		let i = 0;
		const a1: [number, number] = [1, 2];

		const check = (...nums: Array<number>) => {
			expect(nums[0]).to.equal(1);
			expect(nums[1]).to.equal(2);
			expect(nums[2]).to.equal(1);
			expect(nums[3]).to.equal(2);
			expect(nums[4]).to.equal(1);
			expect(nums[5]).to.equal(2);
			expect(nums[6]).to.equal(3);
			expect(nums[7]).to.equal(4);
		};
		check(...a1, ...a1, ++i, ++i, ++i, ++i);
	});

	it("should work with generic types", () => {
		function f<T extends Array<unknown>>(...args: T) {
			expect([...args][0]).to.equal("Hi!");
		}

		f("Hi!");
	});
};

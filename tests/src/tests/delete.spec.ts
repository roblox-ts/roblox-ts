/// <reference types="@rbxts/testez/globals" />

type fruits = {
	apples?: number;
	bananas: number;
	pears?: number;
};

export = () => {
	describe("should work for objects", () => {
		it("should delete from the object with property acccess", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
				pears: 7,
			};

			delete myTrolly.apples;
			delete (myTrolly.pears);

			expect(myTrolly.apples).to.equal(undefined);
			expect(myTrolly.pears).to.equal(undefined);
		});

		it("should delete with optional property access", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
				pears: 7,
			};

			delete myTrolly?.apples;
			delete (myTrolly?.pears);

			expect(myTrolly.apples).to.equal(undefined);
			expect(myTrolly.pears).to.equal(undefined);
		});

		it("should delete from the object with element access", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
				pears: 7,
			};

			delete myTrolly["apples"];
			delete (myTrolly["pears"]);

			expect(myTrolly.apples).to.equal(undefined);
			expect(myTrolly.pears).to.equal(undefined);
		});

		it("should delete with optional element access", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
				pears: 7,
			};

			delete myTrolly?.["apples"];
			delete (myTrolly?.["pears"]);

			expect(myTrolly.apples).to.equal(undefined);
			expect(myTrolly.pears).to.equal(undefined);
		});

		it("should not delete other properties", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
			};

			delete myTrolly.apples;
			delete myTrolly?.apples;
			delete myTrolly?.["apples"];
			delete myTrolly?.["apples"];

			expect(myTrolly.bananas).to.equal(6);
		});

		it("should be able to do objects inside objects", () => {
			const myTrollies: { c: fruits } = {
				c: {
					apples: 5,
					bananas: 6,
				},
			};

			delete myTrollies.c.apples;

			expect(myTrollies.c.apples).to.equal(undefined);
		});
	});

	// we use this function as otherwise TypeScript will evaluate the type of the variable and determine if it's possible to perform optional chaining on it.
	function getFruitsOrUndefined(): fruits | undefined {
		return undefined;
	}

	describe("should return true", () => {
		it("should return true for property access", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
				pears: 7,
			};

			expect(delete myTrolly.apples).to.equal(true);
			expect(delete (myTrolly.pears)).to.equal(true);
		});

		it("should return true for optional property access", () => {
			const myTrolly = getFruitsOrUndefined();

			expect(delete myTrolly?.apples).to.equal(true);
			expect(delete (myTrolly?.pears)).to.equal(true);
		});

		it("should return true for element access", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
				pears: 7,
			};

			expect(delete myTrolly["apples"]).to.equal(true);
			expect(delete (myTrolly["apples"])).to.equal(true);
		});

		it("should return true for optional element access", () => {
			const myTrolly = getFruitsOrUndefined();

			expect(delete myTrolly?.["apples"]).to.equal(true);
			expect(delete (myTrolly?.["pears"])).to.equal(true);
		});
	});
};

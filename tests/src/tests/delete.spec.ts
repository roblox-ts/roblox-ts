/// <reference types="@rbxts/testez/globals" />

type fruits = {
	apples?: number;
	bananas: number;
};

export = () => {
	describe("should work for objects", () => {
		it("should delete from the object", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
			};

			delete myTrolly.apples;

			expect(myTrolly.apples).to.equal(undefined);
		});

		it("should not delete other properties", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
			};

			delete myTrolly.apples;

			expect(myTrolly.bananas).to.equal(6);
		});

		it("should delete functions", () => {
			const myObj: { myFoo?: () => void } = {
				myFoo: () => {
					print("hello world");
				},
			};

			delete myObj.myFoo;

			expect(myObj.myFoo).to.equal(undefined);
		});

		it("should delete array items", () => {
			const myArr = [1, 2, 3, 4, 5];

			delete myArr[2];

			expect(myArr[2]).to.equal(undefined);
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

	describe("should work with function", () => {
		it("should work with objects", () => {
			const myObj: fruits = {
				apples: 5,
				bananas: 6,
			};

			delete (myObj.apples);
			expect(myObj.apples).to.equal(undefined);
		});
	});

	describe("should return the correct values", () => {
		it("should return true", () => {
			const myTrolly: fruits = {
				apples: 5,
				bananas: 6,
			};

			expect(delete myTrolly.apples).to.equal(true); // should return true if successfully deleted
		});
	});
};

/// <reference types="@rbxts/testez/globals" />

let y = 0;
namespace Foo {
	export let x = 1;
	y = x;
}

namespace Bar {
	const plr = {
		ClassName: "Player",
		Name: "Validark",
	};

	export const { ClassName: a } = plr;

	export let { ClassName: b, Name: c } = plr;
	export let { ClassName, Name } = plr;
}

export = () => {
	it("should allow mutatable exports", () => {
		expect(Foo.x).to.equal(1);
		Foo.x = 2;
		expect(Foo.x).to.equal(2);
		expect(y).to.equal(1);
	});

	it("should allow destructured let exports", () => {
		// const check
		expect(Bar.a).to.equal("Player");

		expect(Bar.ClassName).to.equal("Player");
		Bar.ClassName = "Attacker";
		expect(Bar.ClassName).to.equal("Attacker");
		expect(Bar.Name).to.equal("Validark");
		expect(Bar.b).to.equal("Player");
		expect(Bar.c).to.equal("Validark");
		Bar.b = "Nope";
		Bar.c = "Osyris";
		expect(Bar.b).to.equal("Nope");
		expect(Bar.c).to.equal("Osyris");
	});
};

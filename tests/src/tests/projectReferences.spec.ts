import { add } from "../../projects/common/src/native";
import { accumulate, common, Counter, NamedCounter } from "../../projects/shared/src";
import type { Named } from "../../projects/shared/src";

export = () => {
	it("runs a transitive project reference and preserves class identity", () => {
		const counter = new NamedCounter();
		const named: Named = counter;

		expect(named.name).to.equal("shared");
		expect(counter instanceof Counter).to.equal(true);
		expect(counter instanceof common.Counter).to.equal(true);
		expect(counter.increment()).to.equal(1);
		expect(add(4, 5)).to.equal(9);
	});

	it("observes mutable dependency exports and callback order", () => {
		const before = common.total;
		const results = new Array<number>();

		accumulate([2, 3], value => results.push(value));

		expect(results[0]).to.equal(before + 2);
		expect(results[1]).to.equal(before + 5);
		expect(common.total).to.equal(before + 5);
	});
};

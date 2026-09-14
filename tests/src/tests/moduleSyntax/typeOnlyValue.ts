import { effects } from "./effects";

effects.push("type-only module executed");

class TypeOnlyValue {
	value = 0;
}

export = TypeOnlyValue;

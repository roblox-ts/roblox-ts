import { MacroList, PropertyCallMacro } from "TSTransformer/macros/types";
import { size } from "TSTransformer/util/commonTrees";

export const ARRAY_LIKE_METHODS: MacroList<PropertyCallMacro> = {
	size,
};

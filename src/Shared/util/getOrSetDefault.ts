/**
 * Attempts to `map.get(key)`. If the value is `undefined`, it will run `map.set(key, getDefaultValue())` and return that instead.
 * @param map The map to get the value from.
 * @param key A key that is possibly mapped to a value in `map`.
 * @param getDefaultValue A function that returns a default value that `key` should be mapped to, if `key` is not already mapped to something.
 */
export function getOrSetDefault<K, V>(map: Map<K, V>, key: K, getDefaultValue: () => V) {
	let value = map.get(key);
	if (value === undefined) {
		value = getDefaultValue();
		map.set(key, value);
	}
	return value;
}

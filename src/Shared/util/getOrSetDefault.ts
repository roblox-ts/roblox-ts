/**
 * Attempts to `map.get(key)`. If the value does not exist, it will run `map.set(key, getDefaultValue())` and return that instead.
 */
export function getOrSetDefault<K, V>(map: Map<K, V>, key: K, getDefaultValue: () => V) {
	let value = map.get(key);
	if (value === undefined) {
		value = getDefaultValue();
		map.set(key, value);
	}
	return value;
}

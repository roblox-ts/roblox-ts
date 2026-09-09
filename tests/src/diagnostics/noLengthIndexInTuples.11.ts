const value = [1, 2, 3] as const;
const key = "length";
const { [key]: length } = value;

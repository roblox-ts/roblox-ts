const value = [1, 2] as const;
const key = "length";
let length: number;
({ [key]: length } = value);

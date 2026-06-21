const renamed = 1;
const plain = 2;

// export specifiers reach getExportPair's identifier branch:
// `renamed as renamedValue` exercises the propertyName path, `plain` the name path
export { renamed as renamedValue };
export { plain };

export type RenamedType = number;

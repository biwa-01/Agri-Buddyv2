export function isValidTemp(v: number): boolean { return v >= -20 && v <= 60; }
export function isValidHumidity(v: number): boolean { return v >= 0 && v <= 100; }

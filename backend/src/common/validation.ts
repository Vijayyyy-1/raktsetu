import { Transform } from 'class-transformer';

/** Trims and collapses whitespace before validation, so "   " fails @MinLength instead of being stored as "". */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value));

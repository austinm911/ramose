import { MAX_VALUE_DEPTH } from "./types.js";
export const MAX_TIMESTAMP_MILLIS = 8_640_000_000_000_000;
export const MAX_PRODUCED_TEXT_UNITS = 1 << 20;
export const isWellFormedText = (value) => {
    for (let index = 0; index < value.length; index += 1) {
        const unit = value.charCodeAt(index);
        if (unit < 0xd800 || unit > 0xdfff)
            continue;
        if (unit >= 0xdc00)
            return false;
        if (index + 1 >= value.length)
            return false;
        const next = value.charCodeAt(index + 1);
        if (next < 0xdc00 || next > 0xdfff)
            return false;
        index += 1;
    }
    return true;
};
export const classify = (value) => {
    if (value === null)
        return "null";
    if (Array.isArray(value))
        return "collection";
    switch (typeof value) {
        case "boolean":
            return "boolean";
        case "number":
            return "number";
        case "string":
            return isWellFormedText(value) ? "text" : "malformedText";
        default:
            return "object";
    }
};
export const isFiniteNumber = (value) => typeof value === "number" && Number.isFinite(value);
export const isTimestamp = (value) => typeof value === "number" &&
    Number.isSafeInteger(value) &&
    Math.abs(value) <= MAX_TIMESTAMP_MILLIS;
export const matchesValueType = (value, type) => {
    if (value === null)
        return true;
    if (typeof value === "string" && !isWellFormedText(value))
        return false;
    switch (type) {
        case "any":
            return true;
        case "boolean":
            return typeof value === "boolean";
        case "number":
            return isFiniteNumber(value);
        case "timestamp":
            return isTimestamp(value);
        case "text":
            return typeof value === "string";
        case "collection":
            return Array.isArray(value);
    }
};
const asArray = (value) => value;
const asRecord = (value) => value;
export const domainViolation = (value) => {
    const stack = [
        { node: value, depth: 0 },
    ];
    while (stack.length > 0) {
        const frame = stack.pop();
        if (frame === undefined)
            break;
        const node = frame.node;
        if (typeof node === "string") {
            if (!isWellFormedText(node))
                return "malformedText";
            continue;
        }
        if (node === null || typeof node !== "object")
            continue;
        const depth = frame.depth + 1;
        if (depth > MAX_VALUE_DEPTH)
            return "tooDeep";
        if (Array.isArray(node)) {
            for (const item of asArray(node))
                stack.push({ node: item, depth });
        }
        else {
            const record = asRecord(node);
            for (const key of Object.keys(record)) {
                stack.push({ node: record[key], depth });
            }
        }
    }
    return undefined;
};
export const deepEquals = (left, right) => {
    const stack = [[left, right]];
    while (stack.length > 0) {
        const pair = stack.pop();
        if (pair === undefined)
            break;
        const a = pair[0];
        const b = pair[1];
        if (a === b)
            continue;
        if (a === null || b === null)
            return false;
        const aIsArray = Array.isArray(a);
        if (aIsArray !== Array.isArray(b))
            return false;
        if (aIsArray) {
            const x = asArray(a);
            const y = asArray(b);
            if (x.length !== y.length)
                return false;
            for (let i = 0; i < x.length; i += 1)
                stack.push([x[i], y[i]]);
            continue;
        }
        if (typeof a !== "object" || typeof b !== "object")
            return false;
        const x = asRecord(a);
        const y = asRecord(b);
        const xKeys = Object.keys(x);
        if (xKeys.length !== Object.keys(y).length)
            return false;
        for (const key of xKeys) {
            if (!Object.hasOwn(y, key))
                return false;
            stack.push([x[key], y[key]]);
        }
    }
    return true;
};
export const canonicalKey = (value) => {
    const parts = [];
    const stack = [{ node: value }];
    while (stack.length > 0) {
        const frame = stack.pop();
        if (frame === undefined)
            break;
        if ("emit" in frame) {
            parts.push(frame.emit);
            continue;
        }
        const node = frame.node;
        if (node === null) {
            parts.push("z");
            continue;
        }
        if (Array.isArray(node)) {
            const items = asArray(node);
            parts.push(`a${items.length}`);
            for (let i = items.length - 1; i >= 0; i -= 1)
                stack.push({ node: items[i] });
            continue;
        }
        switch (typeof node) {
            case "boolean":
                parts.push(node ? "b1" : "b0");
                continue;
            case "number":
                parts.push(`n${node === 0 ? 0 : node}`);
                continue;
            case "string":
                parts.push(`s${JSON.stringify(node)}`);
                continue;
            default: {
                const record = asRecord(node);
                const keys = Object.keys(record).sort();
                parts.push(`o${keys.length}`);
                for (let i = keys.length - 1; i >= 0; i -= 1) {
                    const key = keys[i];
                    stack.push({ node: record[key] });
                    stack.push({ emit: `k${JSON.stringify(key)}` });
                }
                continue;
            }
        }
    }
    return parts.join("");
};
export const codePoints = (text) => Array.from(text);
export const clampIndex = (index, length) => {
    if (!Number.isFinite(index))
        return 0;
    const whole = Math.trunc(index);
    if (whole < 0)
        return 0;
    if (whole > length)
        return length;
    return whole;
};
const ASCII_UPPERCASE = /[A-Z]/g;
const ASCII_LOWERCASE = /[a-z]/g;
const shiftCase = (character, delta) => String.fromCharCode(character.charCodeAt(0) + delta);
export const asciiLower = (value) => value.replace(ASCII_UPPERCASE, (character) => shiftCase(character, 32));
export const asciiUpper = (value) => value.replace(ASCII_LOWERCASE, (character) => shiftCase(character, -32));
const PINNED_WHITESPACE_LEADING = /^[\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+/;
const PINNED_WHITESPACE_TRAILING = /[\u0009\u000A\u000B\u000C\u000D\u0020\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF]+$/;
export const trimPinned = (value) => value.replace(PINNED_WHITESPACE_LEADING, "").replace(PINNED_WHITESPACE_TRAILING, "");
//# sourceMappingURL=values.js.map
export class Store {
    listeners = new Set();
    value;
    subscription;
    constructor(initial) {
        this.value = initial;
        this.subscription = Object.freeze({
            subscribe: (onChange) => this.subscribe(onChange),
            getSnapshot: () => this.getSnapshot(),
        });
    }
    getSnapshot() {
        return this.value;
    }
    get size() {
        return this.listeners.size;
    }
    subscribe(onChange) {
        this.listeners.add(onChange);
        let released = false;
        return () => {
            if (released)
                return;
            released = true;
            this.listeners.delete(onChange);
        };
    }
    publish(next) {
        if (Object.is(next, this.value))
            return false;
        this.value = next;
        this.notify();
        return true;
    }
    notify() {
        for (const listener of [...this.listeners]) {
            try {
                listener();
            }
            catch {
            }
        }
    }
}
export const sameResult = (left, right) => {
    if (Object.is(left, right))
        return true;
    if (typeof left !== "object" || typeof right !== "object") {
        return false;
    }
    if (left === null || right === null)
        return false;
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right))
            return false;
        return left.length === right.length &&
            left.every((item, index) => sameResult(item, right[index]));
    }
    if (left instanceof Date || right instanceof Date) {
        return left instanceof Date && right instanceof Date &&
            left.getTime() === right.getTime();
    }
    if (left instanceof Uint8Array || right instanceof Uint8Array) {
        return left instanceof Uint8Array && right instanceof Uint8Array &&
            left.length === right.length &&
            left.every((byte, index) => byte === right[index]);
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length)
        return false;
    return leftKeys.every((key) => Object.hasOwn(right, key) &&
        sameResult(left[key], right[key]));
};
//# sourceMappingURL=subscription.js.map
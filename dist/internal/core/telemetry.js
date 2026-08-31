const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
let sink = (e) => console.log(JSON.stringify(e));
let minLevel = "info";
let now = () => Date.now();
export function setTelemetrySink(s) {
    sink = s ?? ((e) => console.log(JSON.stringify(e)));
}
export function setTelemetryLevel(level) {
    minLevel = level;
}
export function setTelemetryClock(clock) {
    now = clock;
}
export function telemetryLevel() {
    return minLevel;
}
export function logEvent(component, event, fields = {}, level = "info") {
    if (LEVELS[level] < LEVELS[minLevel])
        return;
    try {
        sink({ ts: now(), level, component, event, ...fields });
    }
    catch {
    }
}
export function componentLogger(component, base = {}) {
    const b = () => (typeof base === "function" ? base() : base);
    return {
        debug: (event, fields = {}) => logEvent(component, event, { ...b(), ...fields }, "debug"),
        info: (event, fields = {}) => logEvent(component, event, { ...b(), ...fields }, "info"),
        warn: (event, fields = {}) => logEvent(component, event, { ...b(), ...fields }, "warn"),
        error: (event, fields = {}) => logEvent(component, event, { ...b(), ...fields }, "error"),
    };
}
export class Histogram {
    buckets;
    counts;
    count = 0;
    sum = 0;
    max = 0;
    constructor(buckets = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) {
        this.buckets = buckets;
        this.counts = new Array(buckets.length + 1).fill(0);
    }
    observe(x) {
        this.count++;
        this.sum += x;
        if (x > this.max)
            this.max = x;
        let i = 0;
        while (i < this.buckets.length && x > this.buckets[i])
            i++;
        this.counts[i]++;
    }
    percentile(p) {
        if (this.count === 0)
            return 0;
        const target = Math.ceil((p / 100) * this.count);
        let seen = 0;
        for (let i = 0; i < this.counts.length; i++) {
            seen += this.counts[i];
            if (seen >= target)
                return i < this.buckets.length ? this.buckets[i] : Infinity;
        }
        return Infinity;
    }
    snapshot() {
        return { count: this.count, mean: this.count ? this.sum / this.count : 0, p50: this.percentile(50), p95: this.percentile(95), p99: this.percentile(99), max: this.max };
    }
}
export class RateMeter {
    windowMs;
    at = [];
    n = [];
    head = 0;
    total = 0;
    constructor(windowMs = 10_000) {
        this.windowMs = windowMs;
    }
    prune(t) {
        while (this.head < this.at.length && this.at[this.head] < t - this.windowMs)
            this.head++;
        if (this.head > 1024 && this.head > this.at.length / 2) {
            this.at.splice(0, this.head);
            this.n.splice(0, this.head);
            this.head = 0;
        }
    }
    mark(n = 1, at = now()) {
        this.at.push(at);
        this.n.push(n);
        this.total += n;
        this.prune(at);
    }
    rate(at = now()) {
        this.prune(at);
        let sum = 0;
        for (let i = this.head; i < this.n.length; i++)
            sum += this.n[i];
        return (sum / this.windowMs) * 1000;
    }
}
//# sourceMappingURL=telemetry.js.map
/**
 * The peer Worker's env — one type for deploy and runtime.
 *
 * The resource applies {@link import("./Server.ts").ServerAuth} and
 * `token` onto these keys when it owns the Worker. The Worker and both
 * Durable Object classes read the same type at runtime. Adding a key here
 * is what makes it real on both sides; there is no second name list to
 * keep in sync.
 */
export {};
//# sourceMappingURL=RamoseEnv.js.map
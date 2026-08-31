const eventTarget = (value) => value !== null && typeof value === "object" &&
    typeof value.addEventListener === "function" &&
    typeof value.removeEventListener === "function"
    ? value
    : undefined;
const hidden = () => globalThis
    .document?.visibilityState === "hidden";
export const observeActivation = (wake) => {
    const target = eventTarget(globalThis);
    const document = eventTarget(globalThis.document);
    if (target === undefined && document === undefined)
        return () => undefined;
    const activated = () => {
        if (hidden())
            return;
        wake();
    };
    target?.addEventListener("focus", activated);
    target?.addEventListener("pageshow", activated);
    target?.addEventListener("online", activated);
    document?.addEventListener("visibilitychange", activated);
    let released = false;
    return () => {
        if (released)
            return;
        released = true;
        target?.removeEventListener("focus", activated);
        target?.removeEventListener("pageshow", activated);
        target?.removeEventListener("online", activated);
        document?.removeEventListener("visibilitychange", activated);
    };
};
//# sourceMappingURL=activation.js.map
/**
 * `usePull` — a standing `db.livePull(subject, pattern)` as `Live` state:
 * `rows` is the projection or `null` (a retract is an emission, not an end),
 * and a pinned view emits once, completes, and keeps its rows.
 *
 * The view, the `subject`, and the `pattern` are structural —
 * `db.asOf(t)` and `{ id: 17 }` written inline are fine, and a render-fresh
 * `{ title: Todo.title }` is the same pull as a hoisted one.
 */
import { pullPatternKey } from "../db/astKey.js";
import { useMemo } from "octane";
import { useLive } from "./useLive.js";
import { viewDep } from "../react/seam.js";
import { splitSlot, subSlot } from "./internal.js";
/**
 * The subject, flattened to the coordinates the wire would see: `{ id }` to
 * the id, a lookup ref to `[ident, value]` whichever way its head is spelled.
 */
const subjectKey = (subject) => {
    if (Array.isArray(subject) && subject.length === 2) {
        const head = subject[0];
        const ident = typeof head === "object" && head !== null && "ident" in head
            ? head.ident
            : head;
        return JSON.stringify([ident, subject[1]]);
    }
    const id = subject?.id;
    return JSON.stringify(id ?? subject);
};
export function usePull(db, subject, pattern, ...rest) {
    const [, slot] = splitSlot(rest);
    const view = viewDep(db);
    const key = subjectKey(subject);
    const patternKey = pullPatternKey(pattern);
    const stream = useMemo(() => db.effect.livePull(subject, pattern), [view, key, patternKey], subSlot(slot, "pull:stream"));
    return useLive(stream, subSlot(slot, "pull:live"));
}
//# sourceMappingURL=usePull.js.map
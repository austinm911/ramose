import { clientRef, invocationId } from "../db/refs.js";
import { inputEntityRefHandles } from "../internal/authorization/entity-targets.js";
import { projectionIdentity } from "../internal/replication/projection-binding.js";
import { resolveGraphReceiver } from "./graph.js";
import { ReceiptDriver } from "./receipt.js";
const queuedTarget = (target) => {
    if (target === undefined)
        return { type: "none" };
    return target.startsWith("cr1_")
        ? { type: "client-ref", clientRef: target }
        : { type: "entity", entityId: target };
};
const allocationsFor = (operation) => operation.allocations.map((slot) => ({
    slot: slot.slot,
    clientRef: clientRef(),
}));
const enqueue = async (context, database, operation, target, input, driver) => {
    const receiver = await resolveGraphReceiver(database);
    const [catalog, storage] = await Promise.all([
        context.catalog(),
        context.storage(),
    ]);
    const [encoded, version] = [
        operation.encode(input),
        await operation.version(),
    ];
    const allocations = allocationsFor(operation);
    const draft = {
        invocation: driver.receipt.invocation,
        receiver,
        operation: {
            catalog: catalog.key,
            owner: operation.owner,
            localName: operation.localName,
        },
        operationVersion: version,
        target: queuedTarget(target),
        input: encoded,
        allocations,
        inputRefs: inputEntityRefHandles(operation.input, encoded).flatMap((path) => {
            const ref = path.reduce((value, segment) => value[segment], encoded);
            return typeof ref === "string" ? [{ path, ref: ref }] : [];
        }),
        enqueuedAt: Date.now(),
    };
    context.track(receiver, driver);
    await storage.outbox().enqueue(draft, {
        scope: { server: receiver.server, principal: receiver.principal },
        ...(operation.optimistic === undefined ? {} : {
            projection: projectionIdentity(catalog.projections.build, operation.optimistic.revision),
        }),
    });
    driver.queue();
    context.applied(receiver);
    context.submit(receiver);
};
export const mutationNamespace = (context, database, operations, target) => {
    const methods = {};
    for (const [name, operation] of operations) {
        methods[name] = (input) => {
            context.assertLive(`mutate.${name}`);
            const driver = new ReceiptDriver(invocationId());
            void enqueue(context, database, operation, target, input === undefined ? {} : input, driver)
                .catch((cause) => {
                driver.fail(cause instanceof Error ? cause : new Error(String(cause)));
            });
            return driver.receipt;
        };
    }
    return Object.freeze(methods);
};
//# sourceMappingURL=mutation.js.map
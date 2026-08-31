import { Field, string } from "./Field.js";
import { Trait } from "./Trait.js";
const graphFields = {
    catalog: string(),
    name: Field.unique(string(), "strict"),
    doc: string({ optional: true }),
};
const bindGraph = (catalog) => ({
    values: { catalog: catalog.key },
    dependencies: [catalog],
});
/**
 * Bind a concrete entity to a runnable child catalog while retaining one
 * stable `:graph/*` trait identity across every graph composer.
 *
 * The catalog key is supplied by deployed code reachability and is therefore
 * absent from public create and mutation inputs. Graph rows remain ordinary
 * canonically typed entities; creation, policy, querying, refs, uniqueness,
 * and atomic writes all use the existing entity/trait machinery.
 */
export const Graph = Trait("graph", graphFields, {
    bind: bindGraph,
});
//# sourceMappingURL=Graph.js.map
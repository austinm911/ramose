import type { BindableTrait, CodeDefinition } from "./Binding.ts";
import { Field } from "./Field.ts";
import { type Trait as TraitType } from "./Trait.ts";
declare const graphFields: {
    catalog: Field<import("effect/Schema").String, "one", undefined, "string", false, false, false>;
    name: Field<import("effect/Schema").String, "one", "strict", "string", false, false, false>;
    doc: Field<import("effect/Schema").String, "one", undefined, "string", false, true, false>;
};
declare const bindGraph: (catalog: CodeDefinition) => {
    values: {
        catalog: string;
    };
    dependencies: CodeDefinition[];
};
type BuiltInGraph = BindableTrait<TraitType<"graph", typeof graphFields>, typeof bindGraph>;
/**
 * Bind a concrete entity to a runnable child catalog while retaining one
 * stable `:graph/*` trait identity across every graph composer.
 *
 * The catalog key is supplied by deployed code reachability and is therefore
 * absent from public create and mutation inputs. Graph rows remain ordinary
 * canonically typed entities; creation, policy, querying, refs, uniqueness,
 * and atomic writes all use the existing entity/trait machinery.
 */
export declare const Graph: BuiltInGraph;
export {};
//# sourceMappingURL=Graph.d.ts.map
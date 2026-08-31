import * as Result from "effect/Result";
import { QueryFunctionArgumentDomain, QueryFunctionArgumentType, QueryFunctionArity, QueryFunctionContext, QueryFunctionOutputSize, UnknownQueryFunction, } from "./failures.js";
import { standardLibraryImplementationsV1 } from "./implementations.js";
import { standardLibraryManifestV1 } from "./manifest.js";
import { OUTPUT_TOO_LARGE } from "./types.js";
import { MAX_PRODUCED_TEXT_UNITS, classify, domainViolation, matchesValueType, } from "./values.js";
export const standardLibraryV1 = standardLibraryManifestV1;
const cardsByName = new Map(standardLibraryV1.functions.map((card) => [card.name, card]));
const implementationsByName = new Map(Object.entries(standardLibraryImplementationsV1));
const NESTING_PARAMETER_TYPES = new Set(["collection", "any"]);
const ORDERABLE_RESULTS = new Set([
    "boolean",
    "number",
    "timestamp",
    "text",
]);
export const queryFunctionNames = () => [...cardsByName.keys()].sort();
export const isQueryFunctionName = (name) => cardsByName.has(name);
export const lookupQueryFunction = (name) => cardsByName.get(name);
export const validateQueryCall = (call) => {
    const card = cardsByName.get(call.name);
    if (card === undefined) {
        return Result.fail(new UnknownQueryFunction({ name: call.name }));
    }
    const expected = card.signature.parameters.length;
    if (call.argumentCount !== expected) {
        return Result.fail(new QueryFunctionArity({
            name: card.name,
            expected,
            received: call.argumentCount,
        }));
    }
    if (!card.contexts.includes(call.context)) {
        return Result.fail(new QueryFunctionContext({
            name: card.name,
            context: call.context,
            allowed: card.contexts,
        }));
    }
    return Result.succeed(card);
};
export const checkQueryCallArguments = (card, args) => {
    const parameters = card.signature.parameters;
    if (args.length !== parameters.length) {
        return Result.fail(new QueryFunctionArity({
            name: card.name,
            expected: parameters.length,
            received: args.length,
        }));
    }
    for (let index = 0; index < parameters.length; index += 1) {
        const parameter = parameters[index];
        const value = args[index];
        if (!matchesValueType(value, parameter.type)) {
            return Result.fail(new QueryFunctionArgumentType({
                name: card.name,
                index,
                parameter: parameter.name,
                expected: parameter.type,
                received: classify(value),
            }));
        }
        const violation = domainViolation(value);
        if (violation !== undefined) {
            return Result.fail(new QueryFunctionArgumentDomain({
                name: card.name,
                index,
                parameter: parameter.name,
                violation,
            }));
        }
    }
    return Result.succeed(undefined);
};
const sealResult = (card, value) => matchesValueType(value, card.signature.result) ? value : null;
export const evaluateQueryCall = (call) => Result.gen(function* () {
    const card = yield* validateQueryCall({
        name: call.name,
        context: call.context,
        argumentCount: call.args.length,
    });
    yield* checkQueryCallArguments(card, call.args);
    if (card.nulls === "propagate" && call.args.some((arg) => arg === null)) {
        return null;
    }
    const implementation = implementationsByName.get(card.name);
    if (implementation === undefined) {
        return yield* Result.fail(new UnknownQueryFunction({ name: card.name }));
    }
    const produced = implementation(call.args);
    if (produced === OUTPUT_TOO_LARGE) {
        return yield* Result.fail(new QueryFunctionOutputSize({
            name: card.name,
            limit: card.outputLimit ?? MAX_PRODUCED_TEXT_UNITS,
        }));
    }
    return sealResult(card, produced);
});
export const stdlibIntegrityProblems = () => {
    const problems = [];
    const seen = new Set();
    for (const card of standardLibraryV1.functions) {
        if (seen.has(card.name))
            problems.push(`duplicate manifest entry: ${card.name}`);
        seen.add(card.name);
        if (!implementationsByName.has(card.name)) {
            problems.push(`manifest entry without an implementation: ${card.name}`);
        }
        const segments = card.name.split(".");
        if (segments.length !== 2 ||
            segments[0] !== card.namespace ||
            segments[1].length === 0) {
            problems.push(`name is not a namespaced public name: ${card.name}`);
        }
        if (card.contexts.length === 0) {
            problems.push(`no admitted context: ${card.name}`);
        }
        if (card.examples.length === 0) {
            problems.push(`no example: ${card.name}`);
        }
        if (card.outputLimit !== undefined) {
            if (card.signature.result !== "text") {
                problems.push(`output limit on a non-text result: ${card.name}`);
            }
            if (card.outputLimit !== MAX_PRODUCED_TEXT_UNITS) {
                problems.push(`output limit is not the declared cap: ${card.name}`);
            }
        }
        const nests = card.signature.parameters.some((parameter) => NESTING_PARAMETER_TYPES.has(parameter.type));
        if (nests && card.cost === "constant") {
            problems.push(`constant cost with a nestable parameter: ${card.name}`);
        }
        if (card.contexts.includes("orderBy") && !ORDERABLE_RESULTS.has(card.signature.result)) {
            problems.push(`unorderable result admitted in orderBy: ${card.name}`);
        }
    }
    for (const name of implementationsByName.keys()) {
        if (!seen.has(name)) {
            problems.push(`implementation without a manifest entry: ${name}`);
        }
    }
    return problems;
};
//# sourceMappingURL=registry.js.map
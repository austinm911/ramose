import * as Schema from "effect/Schema";
import * as SchemaAST from "effect/SchemaAST";
const freezeJson = (value) => {
    if (value === null || typeof value !== "object")
        return value;
    for (const child of Object.values(value))
        freezeJson(child);
    return Object.isFrozen(value) ? value : Object.freeze(value);
};
const assertRepresentableWireContract = (input, seen = new Set()) => {
    const ast = SchemaAST.toEncoded(input);
    if (seen.has(ast))
        return;
    seen.add(ast);
    if (ast._tag === "Declaration" &&
        ast.annotations?.toCodecJson === undefined &&
        ast.annotations?.toCodec === undefined) {
        const identifier = ast.annotations?.identifier;
        throw new Error(`opaque declaration${typeof identifier === "string" ? ` '${identifier}'` : ""} has no toCodecJson/toCodec public wire projection`);
    }
    switch (ast._tag) {
        case "Declaration":
            for (const child of ast.typeParameters) {
                assertRepresentableWireContract(child, seen);
            }
            break;
        case "Arrays":
            for (const child of [...ast.elements, ...ast.rest]) {
                assertRepresentableWireContract(child, seen);
            }
            break;
        case "Objects":
            for (const property of ast.propertySignatures) {
                assertRepresentableWireContract(property.type, seen);
            }
            for (const index of ast.indexSignatures) {
                assertRepresentableWireContract(index.parameter, seen);
                assertRepresentableWireContract(index.type, seen);
            }
            break;
        case "Union":
            for (const child of ast.types) {
                assertRepresentableWireContract(child, seen);
            }
            break;
        case "TemplateLiteral":
            for (const child of ast.parts) {
                assertRepresentableWireContract(child, seen);
            }
            break;
        case "Suspend":
            assertRepresentableWireContract(ast.thunk(), seen);
            break;
    }
};
const projectSchema = (schema) => {
    try {
        assertRepresentableWireContract(schema.ast);
        return freezeJson(Schema.toJsonSchemaDocument(schema));
    }
    catch (cause) {
        throw new Error(`schema public projection failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
};
const compileSchemaCodec = (schema) => {
    try {
        return Object.freeze({
            decode: Schema.decodeUnknownSync(schema),
            encode: Schema.encodeUnknownSync(schema),
        });
    }
    catch (cause) {
        throw new Error(`schema runtime codec compilation failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
};
export const bindDeployedSchema = (schema) => Object.freeze({
    projection: projectSchema(schema),
    codec: compileSchemaCodec(schema),
});
//# sourceMappingURL=deployedSchema.js.map
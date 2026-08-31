/**
 * One side of a `:ns/attr` ident — entity names and field keys.
 * Letter, then up to 63 letters / digits / `_` / `-` (64 characters total).
 */
export const IDENT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
/** Whether `name` is a valid entity name or field key ({@link IDENT_NAME_RE}). */
export const isIdentName = (name) => IDENT_NAME_RE.test(name);
/**
 * Keys `Entity()` / `Trait()` stamp onto the record-type object. A user
 * field of the same name would overwrite metadata (`id` → every
 * `select({ id: N.id })` reads a string; `ns` → `install()` emits
 * `:[object Object]/id`; `traits` → composition is lost).
 */
export const RESERVED_FIELD_KEYS = [
    "id",
    "ns",
    "fields",
    "_tag",
    "traits",
];
const RESERVED = new Set(RESERVED_FIELD_KEYS);
/** Whether `name` is {@link Entity} metadata and cannot be a field key. */
export const isReservedFieldKey = (name) => RESERVED.has(name);
const IDENT_NAME_MSG = "invalid name — must match IDENT_NAME_RE";
const RESERVED_FIELD_MSG = "reserved field name — id, ns, fields, _tag, and traits are Entity / Trait metadata";
const TRAIT_COLLISION_MSG = "conflicting flattened field names";
const SCHEMA_KEY_MSG = "Schema key must equal the Entity name";
const DUPLICATE_ENTITY_MSG = "duplicate entity name";
export const invalidIdentName = (kind, name) => new Error(`ramose/schema: invalid ${kind} name ${JSON.stringify(name)} — must match ${IDENT_NAME_RE}`);
export const reservedFieldName = (name) => new Error(`ramose/schema: field name ${JSON.stringify(name)} is reserved — id, ns, fields, _tag, and traits are Entity / Trait metadata`);
export const schemaKeyMismatch = (key, ns) => new Error(`ramose/schema: Schema key ${JSON.stringify(key)} does not match Entity name ${JSON.stringify(ns)}`);
export const duplicateEntityName = (ns) => new Error(`ramose/schema: duplicate entity name ${JSON.stringify(ns)}`);
export const conflictingIdent = (ident) => new Error(`ramose/schema: conflicting ident ${JSON.stringify(ident)}`);
//# sourceMappingURL=IdentName.js.map
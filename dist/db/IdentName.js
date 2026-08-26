/**
 * The ident-name rule — public on `ramose/db` (issue #184).
 *
 * Entity names and field keys become the two sides of a `:ns/attr` ident.
 * A space or slash in either side used to install `":my ns/x/a b"`; a
 * catalog key that did not match `entity.ns` silently split policy
 * (`ns.todos`) from the wire (`:todo/*`). The same character class is
 * therefore checked at `Entity()` / `Schema()` definition time, and the
 * regex is exported so an app that generates a schema can check first.
 *
 * Contrast `DATABASE_NAME_RE`: a database name is a route segment (digits
 * and `.` allowed). An ident part is a keyword: it starts with a letter,
 * and `/` `.` `:` and whitespace are rejected so `:ns/attr` stays exactly
 * one slash.
 */
/**
 * One side of a `:ns/attr` ident — entity names and field keys.
 * Letter, then up to 63 letters / digits / `_` / `-` (64 characters total).
 */
export const IDENT_NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/;
/** Whether `name` is a valid entity name or field key ({@link IDENT_NAME_RE}). */
export const isIdentName = (name) => IDENT_NAME_RE.test(name);
/**
 * Keys `Entity()` stamps onto the record-type object. A user field of the
 * same name would overwrite metadata (`id` → every `select({ id: N.id })`
 * reads a string; `ns` → `install()` emits `:[object Object]/id`).
 */
export const RESERVED_FIELD_KEYS = ["id", "ns", "fields", "_tag"];
const RESERVED = new Set(RESERVED_FIELD_KEYS);
/** Whether `name` is {@link Entity} metadata and cannot be a field key. */
export const isReservedFieldKey = (name) => RESERVED.has(name);
const IDENT_NAME_MSG = "invalid name — must match IDENT_NAME_RE";
const RESERVED_FIELD_MSG = "reserved field name — id, ns, fields, and _tag are Entity metadata";
const SCHEMA_KEY_MSG = "Schema key must equal the Entity name";
const DUPLICATE_ENTITY_MSG = "duplicate entity name";
// ── runtime failures (definition time — throws, not DbError) ───────────────
export const invalidIdentName = (kind, name) => new Error(`ramose/schema: invalid ${kind} name ${JSON.stringify(name)} — must match ${IDENT_NAME_RE}`);
export const reservedFieldName = (name) => new Error(`ramose/schema: field name ${JSON.stringify(name)} is reserved — id, ns, fields, and _tag are Entity metadata`);
export const schemaKeyMismatch = (key, ns) => new Error(`ramose/schema: Schema key ${JSON.stringify(key)} does not match Entity name ${JSON.stringify(ns)}`);
export const duplicateEntityName = (ns) => new Error(`ramose/schema: duplicate entity name ${JSON.stringify(ns)}`);
export const conflictingIdent = (ident) => new Error(`ramose/schema: conflicting ident ${JSON.stringify(ident)}`);
//# sourceMappingURL=IdentName.js.map
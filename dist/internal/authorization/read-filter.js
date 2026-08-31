import * as Result from "effect/Result";
import { InvalidTraversal, MissingMe } from "./failures.js";
import { EntityAbsent, False, FieldAbsent, Incomplete, InvalidTraversalProjection, MissingMeProjection, Present, True, } from "./truth.js";
import { entityComposes, fieldAccessibleFrom, prepareAuthorizationCatalog, } from "./validation/catalog.js";
import { fieldKey } from "./validation/common.js";
import { Index, ValueTag } from "../core/datom.js";
import { toWireDatom } from "../core/log.js";
import { RAMOSE_TYPE } from "../core/schema.js";
const denyAll = () => false;
const entityNameFromTypeIdent = (ident) => {
    if (!ident.startsWith(":") || ident.length < 2)
        return undefined;
    const name = ident.slice(1);
    if (name.length === 0 || name.includes("/"))
        return undefined;
    return name;
};
const fieldIdent = (field) => `:${field.id.owner.name}/${field.id.localName}`;
const isIncompleteProjected = (value) => value._tag === "NotLoaded" ||
    value._tag === "InvalidTraversal" ||
    value._tag === "BudgetExhausted" ||
    value._tag === "MissingMe";
const incompleteOf = (value) => {
    switch (value._tag) {
        case "MissingMe":
            return Incomplete(MissingMe);
        case "InvalidTraversal":
        case "NotLoaded":
        case "BudgetExhausted":
            return Incomplete({ _tag: value._tag });
        default:
            return Incomplete(InvalidTraversal);
    }
};
const atomsEqual = (left, right) => {
    if (left === right)
        return true;
    if (left instanceof Date && right instanceof Date)
        return left.getTime() === right.getTime();
    if (left instanceof Uint8Array && right instanceof Uint8Array) {
        if (left.length !== right.length)
            return false;
        for (let i = 0; i < left.length; i++) {
            if (left[i] !== right[i])
                return false;
        }
        return true;
    }
    return false;
};
const projectedEqual = (left, right) => {
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        for (let i = 0; i < left.length; i++) {
            if (!atomsEqual(left[i], right[i]))
                return false;
        }
        return true;
    }
    return atomsEqual(left, right);
};
const atomValue = (datom) => datom.vt === ValueTag.Inst ? new Date(datom.v) : datom.v;
const andTruth = (parts) => {
    let incomplete;
    for (const part of parts) {
        if (part._tag === "False")
            return False;
        if (part._tag === "Incomplete")
            incomplete = part;
    }
    return incomplete ?? True;
};
const orTruth = (parts) => {
    let incomplete;
    for (const part of parts) {
        if (part._tag === "True")
            return True;
        if (part._tag === "Incomplete")
            incomplete = part;
    }
    return incomplete ?? False;
};
const notTruth = (value) => {
    if (value._tag === "True")
        return False;
    if (value._tag === "False")
        return True;
    return value;
};
const eqTruth = (left, right) => {
    if (isIncompleteProjected(left))
        return incompleteOf(left);
    if (isIncompleteProjected(right))
        return incompleteOf(right);
    if (left._tag !== "Present" || right._tag !== "Present")
        return False;
    return projectedEqual(left.value, right.value) ? True : False;
};
const hasTruth = (term) => {
    if (term._tag === "Present")
        return True;
    if (term._tag === "FieldAbsent" || term._tag === "EntityAbsent")
        return False;
    return incompleteOf(term);
};
const inTruth = (value, collection) => {
    if (isIncompleteProjected(value))
        return incompleteOf(value);
    if (isIncompleteProjected(collection))
        return incompleteOf(collection);
    if (value._tag !== "Present" || collection._tag !== "Present")
        return False;
    if (!Array.isArray(collection.value))
        return Incomplete(InvalidTraversal);
    for (const item of collection.value) {
        if (atomsEqual(value.value, item))
            return True;
    }
    return False;
};
const authorized = (truth) => truth._tag === "True";
export const uniqueCanonicalTypeName = (typeDatoms) => {
    let name;
    for (const datom of typeDatoms) {
        if (typeof datom.v !== "string")
            return undefined;
        const next = entityNameFromTypeIdent(datom.v);
        if (next === undefined)
            return undefined;
        if (name !== undefined && name !== next)
            return undefined;
        name = next;
    }
    return name;
};
const viewKey = (db) => `${db.basisT}:${db.asOfT ?? ""}:${db.isHistory ? 1 : 0}`;
export const compileReadFilter = (input) => {
    try {
        return compilePredicate(input);
    }
    catch {
        return denyAll;
    }
};
const compilePredicate = (input) => {
    const { unit, principal, currentDb, observe } = input;
    const prepared = prepareAuthorizationCatalog({
        database: unit.catalog.database,
        catalog: unit.catalog.id,
        catalogVersion: unit.catalog.version,
        schemaFingerprint: unit.catalog.fingerprint,
    }, unit.catalog);
    if (Result.isFailure(prepared))
        return denyAll;
    const index = prepared.success;
    const attrFields = new Map();
    for (const field of unit.catalog.fields) {
        const attr = currentDb.schema.attr(fieldIdent(field));
        if (attr !== undefined)
            attrFields.set(attr.id, field);
    }
    const rules = new Map();
    for (const rule of unit.policy.rules) {
        rules.set(rule.id, rule.expr);
    }
    const entityDecisions = new Map();
    for (const entry of unit.policy.decisions.entities) {
        entityDecisions.set(entry.target.name, entry.decision);
    }
    const traitDecisions = new Map();
    for (const entry of unit.policy.decisions.traits) {
        traitDecisions.set(entry.target.name, entry.decision);
    }
    const fieldDecisions = new Map();
    for (const entry of unit.policy.decisions.fields) {
        fieldDecisions.set(fieldKey(entry.target), entry.decision);
    }
    const typeMemo = new Map();
    const rowMemo = new Map();
    const observeExists = async (db, eid) => {
        const value = await db.exists(eid);
        observe?.({ _tag: "exists", eid, value });
        return value;
    };
    const classifyFrom = (db, eid) => {
        const key = `${viewKey(db)}:${eid}`;
        const cached = typeMemo.get(key);
        if (cached !== undefined)
            return cached;
        const pending = (async () => {
            const typeDatoms = await db.datomsArray(Index.EAVT, { e: eid, a: RAMOSE_TYPE });
            observe?.({
                _tag: "type",
                eid,
                datoms: typeDatoms.map(toWireDatom),
            });
            const name = uniqueCanonicalTypeName(typeDatoms);
            if (name === undefined)
                return undefined;
            return index.entities.get(name);
        })();
        typeMemo.set(key, pending);
        return pending;
    };
    const classifyCurrent = (eid) => classifyFrom(currentDb, eid);
    const focusOf = (entity) => ({ _tag: "entity", entity });
    const lookupField = async (eid, field) => {
        const ident = fieldIdent(field);
        const attr = currentDb.schema.attr(ident);
        if (attr === undefined) {
            observe?.({
                _tag: "field",
                eid,
                ident,
                attributeId: null,
                datoms: [],
            });
            return InvalidTraversalProjection;
        }
        if (field.cardinality === "many") {
            const datoms = await currentDb.datomsArray(Index.EAVT, { e: eid, a: attr.id });
            observe?.({
                _tag: "field",
                eid,
                ident,
                attributeId: attr.id,
                datoms: datoms.map(toWireDatom),
            });
            if (datoms.length === 0) {
                return (await observeExists(currentDb, eid)) ? FieldAbsent : EntityAbsent;
            }
            return Present(datoms.map(atomValue));
        }
        const datom = await currentDb.first(Index.EAVT, { e: eid, a: attr.id });
        observe?.({
            _tag: "field",
            eid,
            ident,
            attributeId: attr.id,
            datoms: datom === undefined ? [] : [toWireDatom(datom)],
        });
        if (datom === undefined) {
            return (await observeExists(currentDb, eid)) ? FieldAbsent : EntityAbsent;
        }
        return Present(atomValue(datom));
    };
    const catalogField = (id) => index.fields.get(fieldKey(id));
    const projectRef = async (term, resourceEid, resourceEntity) => {
        let eid;
        let focus;
        if (term.root._tag === "resource") {
            eid = resourceEid;
            focus = focusOf(resourceEntity);
        }
        else if (term.root._tag === "me") {
            if (principal.me === undefined)
                return MissingMeProjection;
            eid = principal.me.eid;
            const meEntity = await classifyCurrent(eid);
            if (meEntity === undefined)
                return EntityAbsent;
            focus = focusOf(meEntity);
        }
        else {
            return InvalidTraversalProjection;
        }
        if (term.steps.length === 0) {
            return (await observeExists(currentDb, eid)) ? Present(eid) : EntityAbsent;
        }
        for (let i = 0; i < term.steps.length; i++) {
            const step = term.steps[i];
            const field = catalogField(step.field);
            if (field === undefined)
                return InvalidTraversalProjection;
            if (!fieldAccessibleFrom(index, focus, field))
                return InvalidTraversalProjection;
            const isLast = i === term.steps.length - 1;
            if (!isLast) {
                if (field.cardinality === "many" || field.valueType !== "ref") {
                    return InvalidTraversalProjection;
                }
                const hop = await lookupField(eid, field);
                if (hop._tag !== "Present")
                    return hop;
                if (typeof hop.value !== "number")
                    return InvalidTraversalProjection;
                eid = hop.value;
                const next = await classifyCurrent(eid);
                if (next === undefined)
                    return EntityAbsent;
                focus = focusOf(next);
                continue;
            }
            return lookupField(eid, field);
        }
        return InvalidTraversalProjection;
    };
    const projectTerm = async (term, resourceEid, resourceEntity) => {
        switch (term._tag) {
            case "lit":
                return Present(term.value);
            case "subject":
                return Present(principal.subject);
            case "me":
                return principal.me === undefined ? MissingMeProjection : Present(principal.me.eid);
            case "claim": {
                if (!Object.hasOwn(principal.claims, term.key))
                    return FieldAbsent;
                const value = principal.claims[term.key];
                if (value === undefined)
                    return FieldAbsent;
                return Present(value);
            }
            case "ref":
                return projectRef(term, resourceEid, resourceEntity);
            default:
                return InvalidTraversalProjection;
        }
    };
    const evalExpr = async (expr, resourceEid, resourceEntity) => {
        switch (expr._tag) {
            case "const":
                return expr.value ? True : False;
            case "hasClass":
                return principal.classes.includes(expr.class) ? True : False;
            case "and": {
                const parts = [];
                for (const child of expr.exprs) {
                    const part = await evalExpr(child, resourceEid, resourceEntity);
                    if (part._tag === "False")
                        return False;
                    parts.push(part);
                }
                return andTruth(parts);
            }
            case "or": {
                const parts = [];
                for (const child of expr.exprs) {
                    const part = await evalExpr(child, resourceEid, resourceEntity);
                    if (part._tag === "True")
                        return True;
                    parts.push(part);
                }
                return orTruth(parts);
            }
            case "not":
                return notTruth(await evalExpr(expr.expr, resourceEid, resourceEntity));
            case "eq":
                return eqTruth(await projectTerm(expr.left, resourceEid, resourceEntity), await projectTerm(expr.right, resourceEid, resourceEntity));
            case "has":
                return hasTruth(await projectTerm(expr.term, resourceEid, resourceEntity));
            case "in":
                return inTruth(await projectTerm(expr.value, resourceEid, resourceEntity), await projectTerm(expr.collection, resourceEid, resourceEntity));
            default:
                return Incomplete(InvalidTraversal);
        }
    };
    const evaluateDecision = async (decision, resourceEid, resourceEntity) => {
        for (const id of decision.deny) {
            const expr = rules.get(id);
            if (expr === undefined)
                return false;
            if ((await evalExpr(expr, resourceEid, resourceEntity))._tag !== "False")
                return false;
        }
        for (const id of decision.allow) {
            const expr = rules.get(id);
            if (expr === undefined)
                continue;
            if (authorized(await evalExpr(expr, resourceEid, resourceEntity)))
                return true;
        }
        return false;
    };
    const isRowReadable = (db, eid) => {
        const key = `${viewKey(db)}:${eid}`;
        const cached = rowMemo.get(key);
        if (cached !== undefined)
            return cached;
        const pending = (async () => {
            const entity = await classifyFrom(db, eid);
            if (entity === undefined)
                return false;
            const decision = entityDecisions.get(entity.name);
            if (decision === undefined)
                return false;
            return evaluateDecision(decision, eid, entity);
        })();
        rowMemo.set(key, pending);
        return pending;
    };
    const isTraitReadable = async (eid, entity, traitName) => {
        if (!entityComposes(index, entity, traitName))
            return false;
        const decision = traitDecisions.get(traitName);
        if (decision === undefined)
            return false;
        return evaluateDecision(decision, eid, entity);
    };
    const isFieldReadable = async (db, eid, entity, field) => {
        if (!fieldAccessibleFrom(index, focusOf(entity), field))
            return false;
        if (!(await isRowReadable(db, eid)))
            return false;
        if (field.id.owner.kind === "trait") {
            if (!(await isTraitReadable(eid, entity, field.id.owner.name)))
                return false;
        }
        const fieldDecision = fieldDecisions.get(fieldKey(field.id));
        if (fieldDecision !== undefined) {
            return evaluateDecision(fieldDecision, eid, entity);
        }
        return true;
    };
    const refTargetMatches = (field, target) => {
        switch (field.refTarget._tag) {
            case "untargeted":
                return true;
            case "entity":
                return field.refTarget.entity.name === target.name;
            case "trait":
                return entityComposes(index, target, field.refTarget.trait.name);
            case "self":
                return field.id.owner.kind === "entity"
                    ? field.id.owner.name === target.name
                    : entityComposes(index, target, field.id.owner.name);
        }
    };
    return async (db, datom) => {
        try {
            const entity = await classifyFrom(db, datom.e);
            if (entity === undefined)
                return false;
            if (datom.a === RAMOSE_TYPE) {
                return isRowReadable(db, datom.e);
            }
            const field = attrFields.get(datom.a);
            if (field === undefined)
                return false;
            if (!(await isFieldReadable(db, datom.e, entity, field)))
                return false;
            if (datom.vt === ValueTag.Ref) {
                if (typeof datom.v !== "number")
                    return false;
                if (field.valueType !== "ref")
                    return false;
                const target = await classifyFrom(db, datom.v);
                if (target === undefined || !refTargetMatches(field, target))
                    return false;
                if (!(await isRowReadable(db, datom.v)))
                    return false;
            }
            return true;
        }
        catch {
            return false;
        }
    };
};
//# sourceMappingURL=read-filter.js.map
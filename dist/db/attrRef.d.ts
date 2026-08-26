/** @internal Shared attr-ref narrowing / ident lowering. Not part of the public surface. */
export declare const isAttrRef: (a: unknown) => a is {
    readonly ident: string;
};
/** `User.name` → `":user/name"`; an ident string passes through. */
export declare const lowerAttr: (a: unknown) => string;
//# sourceMappingURL=attrRef.d.ts.map
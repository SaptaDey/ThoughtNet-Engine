"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildSafeNodeLabelQuery = exports.buildSafeRelationshipQuery = exports.sanitizeCypherIdentifier = exports.validateNodeType = exports.validateRelationshipType = exports.CypherValidationError = void 0;
const graphElements_1 = require("../domain/models/graphElements");
class CypherValidationError extends Error {
    constructor(message) {
        super(message);
        this.name = 'CypherValidationError';
    }
}
exports.CypherValidationError = CypherValidationError;
const validateRelationshipType = (edgeType) => {
    const allowedTypes = Object.values(graphElements_1.EdgeType).map(e => e.valueOf());
    if (!allowedTypes.includes(edgeType)) {
        throw new CypherValidationError(`Invalid relationship type: ${edgeType}. Allowed types: ${allowedTypes.join(', ')}`);
    }
    return edgeType;
};
exports.validateRelationshipType = validateRelationshipType;
const validateNodeType = (nodeType) => {
    const allowedTypes = Object.values(graphElements_1.NodeType).map(n => n.valueOf());
    if (!allowedTypes.includes(nodeType)) {
        throw new CypherValidationError(`Invalid node type: ${nodeType}. Allowed types: ${allowedTypes.join(', ')}`);
    }
    return nodeType;
};
exports.validateNodeType = validateNodeType;
const sanitizeCypherIdentifier = (identifier) => {
    if (!identifier || typeof identifier !== 'string') {
        throw new CypherValidationError('Identifier must be a non-empty string');
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(identifier)) {
        throw new CypherValidationError(`Invalid identifier format: ${identifier}. Must contain only letters, numbers, and underscores, and start with a letter or underscore.`);
    }
    if (identifier.length > 100) {
        throw new CypherValidationError(`Identifier too long: ${identifier}. Maximum length is 100 characters.`);
    }
    return identifier;
};
exports.sanitizeCypherIdentifier = sanitizeCypherIdentifier;
const buildSafeRelationshipQuery = (sourceNode, targetNode, relationshipType, properties) => {
    const validatedType = (0, exports.validateRelationshipType)(relationshipType.valueOf());
    const query = `
    MATCH (source:Node {id: $sourceId})
    MATCH (target:Node {id: $targetId})
    MERGE (source)-[r:${validatedType} {id: $props.id}]->(target)
    SET r += $props
    RETURN r.id as rel_id
  `;
    const params = {
        sourceId: sourceNode,
        targetId: targetNode,
        props: properties || {}
    };
    return { query, params };
};
exports.buildSafeRelationshipQuery = buildSafeRelationshipQuery;
const buildSafeNodeLabelQuery = (nodeTypes) => {
    const validatedTypes = nodeTypes.map(nt => (0, exports.validateNodeType)(nt.valueOf()));
    const labelConditions = validatedTypes.map(nt => `n:${nt}`);
    return `(${labelConditions.join(' OR ')})`;
};
exports.buildSafeNodeLabelQuery = buildSafeNodeLabelQuery;

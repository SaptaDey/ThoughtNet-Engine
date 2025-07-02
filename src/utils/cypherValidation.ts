import { EdgeType, NodeType } from '../domain/models/graphElements';

export class CypherValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CypherValidationError';
  }
}

export const validateRelationshipType = (edgeType: string): string => {
  const allowedTypes = Object.values(EdgeType).map(e => e.valueOf());
  
  if (!allowedTypes.includes(edgeType)) {
    throw new CypherValidationError(`Invalid relationship type: ${edgeType}. Allowed types: ${allowedTypes.join(', ')}`);
  }
  
  return edgeType;
};

export const validateNodeType = (nodeType: string): string => {
  const allowedTypes = Object.values(NodeType).map(n => n.valueOf());
  
  if (!allowedTypes.includes(nodeType)) {
    throw new CypherValidationError(`Invalid node type: ${nodeType}. Allowed types: ${allowedTypes.join(', ')}`);
  }
  
  return nodeType;
};

export const sanitizeCypherIdentifier = (identifier: string): string => {
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

export const buildSafeRelationshipQuery = (
  sourceNode: string,
  targetNode: string,
  relationshipType: EdgeType,
  properties?: Record<string, any>
): { query: string; params: Record<string, any> } => {
  const validatedType = validateRelationshipType(relationshipType.valueOf());
  
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

export const buildSafeNodeLabelQuery = (nodeTypes: NodeType[]): string => {
  const validatedTypes = nodeTypes.map(nt => validateNodeType(nt.valueOf()));
  const labelConditions = validatedTypes.map(nt => `n:${nt}`);
  return `(${labelConditions.join(' OR ')})`;
};
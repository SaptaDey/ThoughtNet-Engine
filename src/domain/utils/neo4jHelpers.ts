import { Node, NodeMetadata, Edge } from '../models/graphElements';

export function prepareNodePropertiesForNeo4j(node: Node): Record<string, any> {
  const properties: Record<string, any> = {
    id: node.id,
    label: node.label,
    type: node.type,
    created_at: node.created_at.toISOString(),
    updated_at: node.updated_at.toISOString(),
    confidence_empirical_support: node.confidence.empirical_support,
    confidence_theoretical_basis: node.confidence.theoretical_basis,
    confidence_methodological_rigor: node.confidence.methodological_rigor,
    confidence_consensus_alignment: node.confidence.consensus_alignment,
  };

  // Flatten metadata properties
  for (const key in node.metadata) {
    if (Object.prototype.hasOwnProperty.call(node.metadata, key)) {
      const value = (node.metadata as any)[key];
      if (value instanceof Date) {
        properties[`metadata_${key}`] = value.toISOString();
      } else if (Array.isArray(value)) {
        properties[`metadata_${key}`] = JSON.stringify(value); // Store arrays as JSON strings
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested objects if any, though NodeMetadata is mostly flat
        properties[`metadata_${key}`] = JSON.stringify(value);
      } else {
        properties[`metadata_${key}`] = value;
      }
    }
  }

  return properties;
}

export function prepareEdgePropertiesForNeo4j(edge: Edge): Record<string, any> {
  const properties: Record<string, any> = {
    id: edge.id,
    source_id: edge.source_id,
    target_id: edge.target_id,
    type: edge.type,
    confidence: edge.confidence,
    created_at: edge.created_at.toISOString(),
    updated_at: edge.updated_at.toISOString(),
  };

  // Flatten metadata properties
  for (const key in edge.metadata) {
    if (Object.prototype.hasOwnProperty.call(edge.metadata, key)) {
      const value = (edge.metadata as any)[key];
      if (value instanceof Date) {
        properties[`metadata_${key}`] = value.toISOString();
      } else if (Array.isArray(value)) {
        properties[`metadata_${key}`] = JSON.stringify(value); // Store arrays as JSON strings
      } else if (typeof value === 'object' && value !== null) {
        // Handle nested objects if any, though EdgeMetadata is mostly flat
        properties[`metadata_${key}`] = JSON.stringify(value);
      } else {
        properties[`metadata_${key}`] = value;
      }
    }
  }

  return properties;
}
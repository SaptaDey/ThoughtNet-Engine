"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prepareNodePropertiesForNeo4j = prepareNodePropertiesForNeo4j;
exports.prepareEdgePropertiesForNeo4j = prepareEdgePropertiesForNeo4j;
function prepareNodePropertiesForNeo4j(node) {
    const properties = {
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
            const value = node.metadata[key];
            if (value instanceof Date) {
                properties[`metadata_${key}`] = value.toISOString();
            }
            else if (Array.isArray(value)) {
                properties[`metadata_${key}`] = JSON.stringify(value); // Store arrays as JSON strings
            }
            else if (typeof value === 'object' && value !== null) {
                // Handle nested objects if any, though NodeMetadata is mostly flat
                properties[`metadata_${key}`] = JSON.stringify(value);
            }
            else {
                properties[`metadata_${key}`] = value;
            }
        }
    }
    return properties;
}
function prepareEdgePropertiesForNeo4j(edge) {
    const properties = {
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
            const value = edge.metadata[key];
            if (value instanceof Date) {
                properties[`metadata_${key}`] = value.toISOString();
            }
            else if (Array.isArray(value)) {
                properties[`metadata_${key}`] = JSON.stringify(value); // Store arrays as JSON strings
            }
            else if (typeof value === 'object' && value !== null) {
                // Handle nested objects if any, though EdgeMetadata is mostly flat
                properties[`metadata_${key}`] = JSON.stringify(value);
            }
            else {
                properties[`metadata_${key}`] = value;
            }
        }
    }
    return properties;
}

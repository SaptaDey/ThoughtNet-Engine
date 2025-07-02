
import winston from 'winston';
import { settings } from '../../config';

const logger = winston.createLogger({
  level: settings.app.log_level.toLowerCase(),
  format: winston.format.combine(
    winston.format.colorize(),
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    winston.format.printf(info => `${info.timestamp} |${info.level} | ${info.message}`)
  ),
  transports: [
    new winston.transports.Console()
  ],
});

export interface GraphNode {
  id: string;
  neighbors: string[];
  weight?: number;
  metadata?: Record<string, any>;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight?: number;
  type?: string;
}

export interface Graph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export interface CommunityResult {
  communities: Record<string, number>; // nodeId -> communityId
  modularity: number;
  numCommunities: number;
}

export interface CentralityResult {
  degree: Record<string, number>;
  betweenness: Record<string, number>;
  closeness: Record<string, number>;
  eigenvector: Record<string, number>;
}

/**
 * Builds a graph from nodes and edges for analysis
 */
export function buildGraph(nodes: Array<{id: string, metadata?: any}>, edges: Array<{source: string, target: string, weight?: number}>): Graph {
  const graph: Graph = {
    nodes: new Map(),
    edges: []
  };

  // Initialize nodes
  nodes.forEach(node => {
    graph.nodes.set(node.id, {
      id: node.id,
      neighbors: [],
      metadata: node.metadata
    });
  });

  // Add edges and build adjacency lists
  edges.forEach(edge => {
    const sourceNode = graph.nodes.get(edge.source);
    const targetNode = graph.nodes.get(edge.target);
    
    if (sourceNode && targetNode) {
      sourceNode.neighbors.push(edge.target);
      targetNode.neighbors.push(edge.source);
      graph.edges.push(edge);
    }
  });

  return graph;
}

/**
 * Detects communities using a simplified Louvain algorithm implementation
 */
export function detectCommunities(graph: Graph): CommunityResult {
  logger.info("Running community detection using Louvain algorithm");
  
  if (graph.nodes.size === 0) {
    return { communities: {}, modularity: 0, numCommunities: 0 };
  }

  // Initialize: each node in its own community
  const communities: Record<string, number> = {};
  let communityId = 0;
  graph.nodes.forEach((node, nodeId) => {
    communities[nodeId] = communityId++;
  });

  let improved = true;
  let iterations = 0;
  const maxIterations = 100;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    for (const [nodeId, node] of graph.nodes) {
      const currentCommunity = communities[nodeId];
      let bestCommunity = currentCommunity;
      let bestGain = 0;

      // Check neighboring communities
      const neighborCommunities = new Set<number>();
      node.neighbors.forEach(neighborId => {
        if (communities[neighborId] !== undefined) {
          neighborCommunities.add(communities[neighborId]);
        }
      });

      neighborCommunities.forEach(neighborCommunity => {
        if (neighborCommunity !== currentCommunity) {
          const gain = calculateModularityGain(graph, nodeId, currentCommunity, neighborCommunity, communities);
          if (gain > bestGain) {
            bestGain = gain;
            bestCommunity = neighborCommunity;
          }
        }
      });

      if (bestCommunity !== currentCommunity) {
        communities[nodeId] = bestCommunity;
        improved = true;
      }
    }
  }

  // Calculate final modularity
  const modularity = calculateModularity(graph, communities);
  const numCommunities = new Set(Object.values(communities)).size;

  logger.info(`Community detection completed: ${numCommunities} communities found, modularity: ${modularity.toFixed(3)}`);

  return { communities, modularity, numCommunities };
}

/**
 * Calculates various centrality measures for all nodes
 */
export function calculateNodeCentrality(graph: Graph): CentralityResult {
  logger.info("Calculating node centrality measures");

  const result: CentralityResult = {
    degree: {},
    betweenness: {},
    closeness: {},
    eigenvector: {}
  };

  if (graph.nodes.size === 0) {
    return result;
  }

  // Degree centrality
  graph.nodes.forEach((node, nodeId) => {
    result.degree[nodeId] = node.neighbors.length;
  });

  // Betweenness centrality (simplified implementation)
  result.betweenness = calculateBetweennessCentrality(graph);

  // Closeness centrality
  result.closeness = calculateClosenessCentrality(graph);

  // Eigenvector centrality (simplified power iteration)
  result.eigenvector = calculateEigenvectorCentrality(graph);

  logger.info("Node centrality calculation completed");
  return result;
}

/**
 * Calculates betweenness centrality using shortest paths
 */
function calculateBetweennessCentrality(graph: Graph): Record<string, number> {
  const betweenness: Record<string, number> = {};
  
  // Initialize
  graph.nodes.forEach((_, nodeId) => {
    betweenness[nodeId] = 0;
  });

  // For each pair of nodes, find shortest paths and count how many pass through each node
  for (const [sourceId] of graph.nodes) {
    const paths = breadthFirstSearch(graph, sourceId);
    
    for (const [targetId] of graph.nodes) {
      if (sourceId !== targetId && paths[targetId]) {
        const shortestPaths = paths[targetId];
        shortestPaths.forEach(path => {
          // Add to betweenness for intermediate nodes
          for (let i = 1; i < path.length - 1; i++) {
            betweenness[path[i]] += 1;
          }
        });
      }
    }
  }

  // Normalize
  const n = graph.nodes.size;
  const normalizationFactor = n > 2 ? 2 / ((n - 1) * (n - 2)) : 1;
  Object.keys(betweenness).forEach(nodeId => {
    betweenness[nodeId] *= normalizationFactor;
  });

  return betweenness;
}

/**
 * Calculates closeness centrality
 */
function calculateClosenessCentrality(graph: Graph): Record<string, number> {
  const closeness: Record<string, number> = {};

  graph.nodes.forEach((_, nodeId) => {
    const distances = dijkstra(graph, nodeId);
    const validDistances = Object.values(distances).filter(d => d < Infinity);
    
    if (validDistances.length > 1) {
      const averageDistance = validDistances.reduce((sum, d) => sum + d, 0) / validDistances.length;
      closeness[nodeId] = averageDistance > 0 ? 1 / averageDistance : 0;
    } else {
      closeness[nodeId] = 0;
    }
  });

  return closeness;
}

/**
 * Calculates eigenvector centrality using power iteration
 */
function calculateEigenvectorCentrality(graph: Graph): Record<string, number> {
  const eigenvector: Record<string, number> = {};
  const nodeIds = Array.from(graph.nodes.keys());
  const n = nodeIds.length;

  if (n === 0) return eigenvector;

  // Initialize with equal values
  nodeIds.forEach(nodeId => {
    eigenvector[nodeId] = 1 / Math.sqrt(n);
  });

  // Power iteration
  const maxIterations = 100;
  const tolerance = 1e-6;

  for (let iter = 0; iter < maxIterations; iter++) {
    const newEigenvector: Record<string, number> = {};
    
    // Initialize
    nodeIds.forEach(nodeId => {
      newEigenvector[nodeId] = 0;
    });

    // Matrix multiplication
    nodeIds.forEach(nodeId => {
      const node = graph.nodes.get(nodeId)!;
      node.neighbors.forEach(neighborId => {
        if (eigenvector[neighborId] !== undefined) {
          newEigenvector[nodeId] += eigenvector[neighborId];
        }
      });
    });

    // Normalize
    const norm = Math.sqrt(nodeIds.reduce((sum, nodeId) => sum + newEigenvector[nodeId] ** 2, 0));
    if (norm > 0) {
      nodeIds.forEach(nodeId => {
        newEigenvector[nodeId] /= norm;
      });
    }

    // Check convergence
    const diff = nodeIds.reduce((sum, nodeId) => 
      sum + Math.abs(newEigenvector[nodeId] - eigenvector[nodeId]), 0);
    
    Object.assign(eigenvector, newEigenvector);
    
    if (diff < tolerance) break;
  }

  return eigenvector;
}

/**
 * Helper function for modularity calculation
 */
function calculateModularity(graph: Graph, communities: Record<string, number>): number {
  const m = graph.edges.length;
  if (m === 0) return 0;

  let modularity = 0;
  const communityDegrees: Record<number, number> = {};

  // Calculate degree sum for each community
  graph.nodes.forEach((node, nodeId) => {
    const community = communities[nodeId];
    if (communityDegrees[community] === undefined) {
      communityDegrees[community] = 0;
    }
    communityDegrees[community] += node.neighbors.length;
  });

  // Calculate modularity
  graph.edges.forEach(edge => {
    const sourceCommunity = communities[edge.source];
    const targetCommunity = communities[edge.target];
    
    if (sourceCommunity === targetCommunity) {
      const sourceNode = graph.nodes.get(edge.source)!;
      const targetNode = graph.nodes.get(edge.target)!;
      const expected = (sourceNode.neighbors.length * targetNode.neighbors.length) / (2 * m);
      modularity += 1 - expected;
    }
  });

  return modularity / (2 * m);
}

/**
 * Helper function for modularity gain calculation
 */
function calculateModularityGain(
  graph: Graph, 
  nodeId: string, 
  oldCommunity: number, 
  newCommunity: number, 
  communities: Record<string, number>
): number {
  // Simplified modularity gain calculation
  const node = graph.nodes.get(nodeId)!;
  let gain = 0;

  node.neighbors.forEach(neighborId => {
    const neighborCommunity = communities[neighborId];
    if (neighborCommunity === newCommunity) {
      gain += 1;
    }
    if (neighborCommunity === oldCommunity) {
      gain -= 1;
    }
  });

  return gain;
}

/**
 * Breadth-first search for shortest paths
 */
function breadthFirstSearch(graph: Graph, startId: string): Record<string, string[][]> {
  const paths: Record<string, string[][]> = {};
  const visited = new Set<string>();
  const queue: Array<{nodeId: string, path: string[]}> = [];

  queue.push({nodeId: startId, path: [startId]});
  visited.add(startId);

  while (queue.length > 0) {
    const {nodeId, path} = queue.shift()!;
    
    if (!paths[nodeId]) {
      paths[nodeId] = [];
    }
    paths[nodeId].push([...path]);

    const node = graph.nodes.get(nodeId);
    if (node) {
      node.neighbors.forEach(neighborId => {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({nodeId: neighborId, path: [...path, neighborId]});
        }
      });
    }
  }

  return paths;
}

/**
 * Dijkstra's algorithm for shortest distances
 */
function dijkstra(graph: Graph, startId: string): Record<string, number> {
  const distances: Record<string, number> = {};
  const visited = new Set<string>();
  const queue: Array<{nodeId: string, distance: number}> = [];

  // Initialize distances
  graph.nodes.forEach((_, nodeId) => {
    distances[nodeId] = nodeId === startId ? 0 : Infinity;
  });

  queue.push({nodeId: startId, distance: 0});

  while (queue.length > 0) {
    // Sort queue by distance (simple implementation)
    queue.sort((a, b) => a.distance - b.distance);
    const {nodeId, distance} = queue.shift()!;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = graph.nodes.get(nodeId);
    if (node) {
      node.neighbors.forEach(neighborId => {
        if (!visited.has(neighborId)) {
          const newDistance = distance + 1; // Assuming unit edge weights
          if (newDistance < distances[neighborId]) {
            distances[neighborId] = newDistance;
            queue.push({nodeId: neighborId, distance: newDistance});
          }
        }
      });
    }
  }

  return distances;
}

/**
 * Finds strongly connected components using Tarjan's algorithm
 */
export function findStronglyConnectedComponents(graph: Graph): Array<string[]> {
  const result: Array<string[]> = [];
  const indices: Record<string, number> = {};
  const lowLinks: Record<string, number> = {};
  const onStack: Record<string, boolean> = {};
  const stack: string[] = [];
  let index = 0;

  function strongConnect(nodeId: string): void {
    indices[nodeId] = index;
    lowLinks[nodeId] = index;
    index++;
    stack.push(nodeId);
    onStack[nodeId] = true;

    const node = graph.nodes.get(nodeId);
    if (node) {
      node.neighbors.forEach(neighborId => {
        if (indices[neighborId] === undefined) {
          strongConnect(neighborId);
          lowLinks[nodeId] = Math.min(lowLinks[nodeId], lowLinks[neighborId]);
        } else if (onStack[neighborId]) {
          lowLinks[nodeId] = Math.min(lowLinks[nodeId], indices[neighborId]);
        }
      });
    }

    if (lowLinks[nodeId] === indices[nodeId]) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack[w] = false;
        component.push(w);
      } while (w !== nodeId);
      result.push(component);
    }
  }

  graph.nodes.forEach((_, nodeId) => {
    if (indices[nodeId] === undefined) {
      strongConnect(nodeId);
    }
  });

  return result;
}

/**
 * Calculates graph density
 */
export function calculateGraphDensity(graph: Graph): number {
  const n = graph.nodes.size;
  const m = graph.edges.length;
  
  if (n <= 1) return 0;
  
  // For undirected graph: density = 2m / (n * (n-1))
  return (2 * m) / (n * (n - 1));
}

/**
 * Finds the shortest path between two nodes
 */
export function findShortestPath(graph: Graph, sourceId: string, targetId: string): string[] | null {
  if (!graph.nodes.has(sourceId) || !graph.nodes.has(targetId)) {
    return null;
  }

  const visited = new Set<string>();
  const queue: Array<{nodeId: string, path: string[]}> = [];
  
  queue.push({nodeId: sourceId, path: [sourceId]});
  visited.add(sourceId);

  while (queue.length > 0) {
    const {nodeId, path} = queue.shift()!;
    
    if (nodeId === targetId) {
      return path;
    }

    const node = graph.nodes.get(nodeId);
    if (node) {
      node.neighbors.forEach(neighborId => {
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push({nodeId: neighborId, path: [...path, neighborId]});
        }
      });
    }
  }

  return null; // No path found
}

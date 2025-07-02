import { v4 as uuidv4 } from 'uuid';
import winston from 'winston';
import { settings } from '../../config';
import { GoTProcessorSessionData } from '../models/commonTypes';
import { Node, NodeMetadata, NodeType } from '../models/graphElements';
import { ConfidenceVectorSchema, EpistemicStatus } from '../models/common';
import { BaseStage, StageOutput } from './baseStage';
import { executeQuery, Neo4jError } from '../../infrastructure/neo4jUtils';
import { prepareNodePropertiesForNeo4j } from '../utils/neo4jHelpers';

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

export class InitializationStage extends BaseStage {
  static STAGE_NAME: string = "InitializationStage";
  stageName: string = InitializationStage.STAGE_NAME;
  private rootNodeLabel: string = "Task Understanding";
  private initialConfidenceValues: number[];
  private initialLayer: string;

  constructor(settings: any) {
    super(settings);
    // Assuming settings.asr_got.default_parameters exists and has these properties
    this.initialConfidenceValues = settings.asr_got.default_parameters?.initial_confidence || [0.5, 0.5, 0.5, 0.5];
    this.initialLayer = settings.asr_got.default_parameters?.initial_layer || "0";
  }

  private _logStart(sessionId: string): void {
    logger.info(`[${this.stageName}] Starting for session: ${sessionId}`);
  }

  private _logEnd(sessionId: string, output: StageOutput): void {
    logger.info(`[${this.stageName}] Finished for session: ${sessionId}. Summary: ${output.summary}`);
  }

  async execute(currentSessionData: GoTProcessorSessionData): Promise<StageOutput> {
    this._logStart(currentSessionData.session_id);
    const initialQuery = currentSessionData.query;
    const operationalParams = currentSessionData.accumulated_context.operational_params || {};

    let nodesCreatedInNeo4j = 0;
    let usedExistingNeo4jNode = false;
    let updatedExistingNodeTags = false;
    let rootNodeIdForContext: string | null = null;

    let finalSummaryMessage: string;
    let initialDisciplinaryTagsForContext: string[];

    if (!initialQuery || typeof initialQuery !== 'string') {
      const errorMessage = "Invalid initial query. It must be a non-empty string.";
      logger.error(errorMessage);
      return new StageOutput(
        false,
        errorMessage,
        { [this.stageName]: { error: errorMessage } },
        errorMessage,
        {
          nodes_created_in_neo4j: 0,
          used_existing_neo4j_node: false,
          updated_existing_node_tags: false,
        }
      );
    }

    logger.info(`Attempting to find or create ROOT node in Neo4j for query: ${initialQuery.substring(0, 100)}...`);

    try {
      const findRootQuery = `
        MATCH (n:ROOT)
        WHERE n.metadata_query_context = $initial_query
        RETURN n.id AS nodeId, n.metadata_disciplinary_tags AS current_tags
        LIMIT 1
      `;
      const rootNodeRecords = await executeQuery(findRootQuery, { initial_query: initialQuery }, "read");

      if (rootNodeRecords && rootNodeRecords.length > 0) {
        const rootRecord = rootNodeRecords[0];
        rootNodeIdForContext = rootRecord.nodeId;
        usedExistingNeo4jNode = true;
        logger.info(`Found existing ROOT node '${rootNodeIdForContext}' in Neo4j matching query.`);

        const currentTagsFromDb = new Set(rootRecord.current_tags || []);
        const newlyProvidedTags = new Set(operationalParams.initial_disciplinary_tags || []);

        const combinedTags = new Set([...currentTagsFromDb, ...newlyProvidedTags]);

        if (combinedTags.size !== currentTagsFromDb.size || ![...combinedTags].every(tag => currentTagsFromDb.has(tag))) {
          const updateTagsQuery = `
            MATCH (n:ROOT {id: $node_id})
            SET n.metadata_disciplinary_tags = $tags
            RETURN n.metadata_disciplinary_tags AS updated_tags
          `;
          const updatedTagsResult = await executeQuery(
            updateTagsQuery,
            {
              node_id: rootNodeIdForContext,
              tags: Array.from(combinedTags),
            },
            "write"
          );
          if (updatedTagsResult && updatedTagsResult.length > 0 && updatedTagsResult[0].updated_tags) {
            logger.info(`Updated disciplinary tags for ROOT node '${rootNodeIdForContext}' to: ${updatedTagsResult[0].updated_tags}`);
            updatedExistingNodeTags = true;
            initialDisciplinaryTagsForContext = Array.from(combinedTags);
          } else {
            logger.warn(`Failed to update tags for ROOT node '${rootNodeIdForContext}'. Using existing tags.`);
            initialDisciplinaryTagsForContext = Array.from(currentTagsFromDb);
          }
        } else {
          logger.info(`No change in disciplinary tags for existing ROOT node '${rootNodeIdForContext}'.`);
          initialDisciplinaryTagsForContext = Array.from(currentTagsFromDb);
        }

        finalSummaryMessage = `Using existing ROOT node '${rootNodeIdForContext}' from Neo4j. Disciplinary tags ensured.`;

      } else { // No existing ROOT node found, create one
        logger.info("No existing ROOT node found in Neo4j. Creating a new one.");
        const newRootNodeIdInternal = uuidv4();

        const defaultDisciplines = new Set(
          operationalParams.initial_disciplinary_tags ||
          (this.settings.asr_got.default_parameters?.default_disciplinary_tags || [])
        );
        initialDisciplinaryTagsForContext = Array.from(defaultDisciplines);

        const rootMetadata: NodeMetadata = {
          description: `Initial understanding of the task based on the query: '${initialQuery}'.`,
          query_context: initialQuery,
          source_description: "Core GoT Protocol Definition (P1.1), User Query",
          epistemic_status: EpistemicStatus.ASSUMPTION,
          disciplinary_tags: initialDisciplinaryTagsForContext.join(','), // Storing as comma-separated string
          layer_id: operationalParams.initial_layer || this.initialLayer,
          impact_score: 0.9,
          id: uuidv4(), // This will be overwritten by the Node constructor
          doi: '',
          authors: '',
          publication_date: '',
          revision_history: [],
          created_at: new Date(),
          updated_at: new Date(),
        };

        const rootNode: Node = {
          id: newRootNodeIdInternal,
          label: this.rootNodeLabel,
          type: NodeType.ROOT,
          confidence: ConfidenceVectorSchema.parse({
            empirical_support: this.initialConfidenceValues[0],
            theoretical_basis: this.initialConfidenceValues[1],
            methodological_rigor: this.initialConfidenceValues[2],
            consensus_alignment: this.initialConfidenceValues[3],
          }),
          metadata: rootMetadata,
          created_at: new Date(),
          updated_at: new Date(),
          updateConfidence: () => {}, // Placeholder
        };

        const nodePropsForNeo4j = prepareNodePropertiesForNeo4j(rootNode);
        const typeLabelValue = NodeType.ROOT.valueOf();

        const createQuery = `
          MERGE (n:Node {id: $props.id})
          SET n += $props
          WITH n, $type_label AS typeLabel CALL apoc.create.addLabels(n, [typeLabel]) YIELD node
          RETURN node.id AS new_node_id
        `;
        const queryParams = {
          props: nodePropsForNeo4j,
          type_label: typeLabelValue,
        };
        const creationResult = await executeQuery(createQuery, queryParams, "write");

        if (creationResult && creationResult.length > 0 && creationResult[0].new_node_id) {
          rootNodeIdForContext = creationResult[0].new_node_id;
          nodesCreatedInNeo4j = 1;
          logger.info(`New ROOT node '${rootNodeIdForContext}' created in Neo4j.`);
          finalSummaryMessage = (
            `New ROOT node '${rootNodeIdForContext}' created in Neo4j.`
          );
        } else {
          const errorMessage = "Failed to create or verify new ROOT node in Neo4j.";
          logger.error(
            `${errorMessage} Query: ${createQuery}, Params: ${JSON.stringify(queryParams)}`
          );
          // Return error StageOutput
          return new StageOutput(
            false,
            errorMessage,
            { [this.stageName]: { error: errorMessage } },
            errorMessage,
            {
              nodes_created_in_neo4j: 0,
              used_existing_neo4j_node: false,
              updated_existing_node_tags: false,
            }
          );
        }
      }
    } catch (error: any) {
      const errorMessage = `Neo4j error during ROOT node initialization: ${error.message}`;
      logger.error(errorMessage, error);
      return new StageOutput(
        false,
        errorMessage,
        { [this.stageName]: { error: errorMessage } },
        errorMessage,
        {
          nodes_created_in_neo4j: 0,
          used_existing_neo4j_node: false,
          updated_existing_node_tags: false,
        }
      );
    }

    if (!rootNodeIdForContext) {
      const errorMessage = (
        "Critical error: No root_node_id established after Neo4j operations."
      );
      logger.error(errorMessage);
      return new StageOutput(
        false,
        errorMessage,
        { [this.stageName]: { error: errorMessage } },
        errorMessage,
        {
          nodes_created_in_neo4j: nodesCreatedInNeo4j,
          used_existing_neo4j_node: usedExistingNeo4jNode,
          updated_existing_node_tags: updatedExistingNodeTags,
        }
      );
    }

    const contextUpdate = {
      root_node_id: rootNodeIdForContext,
      initial_disciplinary_tags: initialDisciplinaryTagsForContext,
    };

    const initialConfidenceAvgMetric = 0.0; // Placeholder

    const metrics = {
      nodes_created_in_neo4j: nodesCreatedInNeo4j,
      used_existing_neo4j_node: usedExistingNeo4jNode,
      updated_existing_node_tags: updatedExistingNodeTags,
      initial_confidence_avg: initialConfidenceAvgMetric,
    };

    const output = new StageOutput(
      true,
      finalSummaryMessage,
      { [this.stageName]: contextUpdate },
      undefined,
      metrics
    );
    this._logEnd(currentSessionData.session_id, output);
    return output;
  }
}
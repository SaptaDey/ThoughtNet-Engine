import { GoTProcessor } from './application/gotProcessor';
import { InitializationStage } from './domain/stages/initializationStage';
import { DecompositionStage } from './domain/stages/decompositionStage';
import { HypothesisStage } from './domain/stages/hypothesisStage';
import { EvidenceStage } from './domain/stages/evidenceStage';
import { PruningMergingStage } from './domain/stages/pruningMergingStage';
import { SubgraphExtractionStage } from './domain/stages/subgraphExtractionStage';
import { CompositionStage } from './domain/stages/compositionStage';
import { ReflectionStage } from './domain/stages/reflectionStage';
import { settings } from './config';
import { ResourceMonitor } from './services/resourceMonitor';

const resourceMonitor = new ResourceMonitor();
const gotProcessor = new GoTProcessor(settings, resourceMonitor);

gotProcessor.registerStage(new InitializationStage(settings));
gotProcessor.registerStage(new DecompositionStage(settings));
gotProcessor.registerStage(new HypothesisStage(settings));
gotProcessor.registerStage(new EvidenceStage(settings));
gotProcessor.registerStage(new PruningMergingStage(settings));
gotProcessor.registerStage(new SubgraphExtractionStage(settings));
gotProcessor.registerStage(new CompositionStage(settings));
gotProcessor.registerStage(new ReflectionStage(settings));

(async () => {
  const result = await gotProcessor.processQuery('Analyze the relationship between microbiome diversity and cancer progression.');
  console.log(result);
})();

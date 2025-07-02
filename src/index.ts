import { GoTProcessor } from './application/gotProcessor';
import { settings } from './config';
import { ResourceMonitor } from './services/resourceMonitor';

const resourceMonitor = new ResourceMonitor();
const gotProcessor = new GoTProcessor(settings, resourceMonitor);

(async () => {
  try {
    const result = await gotProcessor.processQuery('Analyze the relationship between microbiome diversity and cancer progression.');
    console.log('Processing Result:', result);
  } catch (error) {
    console.error('Processing failed:', error);
  }
})();

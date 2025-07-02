"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const gotProcessor_1 = require("./application/gotProcessor");
const initializationStage_1 = require("./domain/stages/initializationStage");
const decompositionStage_1 = require("./domain/stages/decompositionStage");
const hypothesisStage_1 = require("./domain/stages/hypothesisStage");
const evidenceStage_1 = require("./domain/stages/evidenceStage");
const pruningMergingStage_1 = require("./domain/stages/pruningMergingStage");
const subgraphExtractionStage_1 = require("./domain/stages/subgraphExtractionStage");
const compositionStage_1 = require("./domain/stages/compositionStage");
const reflectionStage_1 = require("./domain/stages/reflectionStage");
const config_1 = require("./config");
const resourceMonitor_1 = require("./services/resourceMonitor");
const resourceMonitor = new resourceMonitor_1.ResourceMonitor();
const gotProcessor = new gotProcessor_1.GoTProcessor(config_1.settings, resourceMonitor);
gotProcessor.registerStage(new initializationStage_1.InitializationStage(config_1.settings));
gotProcessor.registerStage(new decompositionStage_1.DecompositionStage(config_1.settings));
gotProcessor.registerStage(new hypothesisStage_1.HypothesisStage(config_1.settings));
gotProcessor.registerStage(new evidenceStage_1.EvidenceStage(config_1.settings));
gotProcessor.registerStage(new pruningMergingStage_1.PruningMergingStage(config_1.settings));
gotProcessor.registerStage(new subgraphExtractionStage_1.SubgraphExtractionStage(config_1.settings));
gotProcessor.registerStage(new compositionStage_1.CompositionStage(config_1.settings));
gotProcessor.registerStage(new reflectionStage_1.ReflectionStage(config_1.settings));
(() => __awaiter(void 0, void 0, void 0, function* () {
    const result = yield gotProcessor.processQuery('Analyze the relationship between microbiome diversity and cancer progression.');
    console.log(result);
}))();

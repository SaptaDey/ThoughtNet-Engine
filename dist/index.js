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
const config_1 = require("./config");
const resourceMonitor_1 = require("./services/resourceMonitor");
const resourceMonitor = new resourceMonitor_1.ResourceMonitor();
const gotProcessor = new gotProcessor_1.GoTProcessor(config_1.settings, resourceMonitor);
(() => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const result = yield gotProcessor.processQuery('Analyze the relationship between microbiome diversity and cancer progression.');
        console.log('Processing Result:', result);
    }
    catch (error) {
        console.error('Processing failed:', error);
    }
}))();

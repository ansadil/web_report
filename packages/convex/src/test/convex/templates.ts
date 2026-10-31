import { defineTemplateFunctions } from '../../server.js';
import { tick } from './clock.js';

export const { list, get, save, listVersions, remove } = defineTemplateFunctions({ now: tick });

import initialize, { evaluate_tool_json } from './tool-wasm/tax/dars_tool_wasm.js';
import { serveTool } from './tool-worker';

serveTool(initialize, evaluate_tool_json);

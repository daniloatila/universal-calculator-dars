import init, { evaluate_value_record_json } from './wasm/dars_wasm.js';
import { serveTool } from './tool-worker';
import type { ToolRequest } from './tool-runtime';

serveTool(init, raw => {
  const request = JSON.parse(raw) as ToolRequest;
  return evaluate_value_record_json(request.input, '{}');
});

declare module '*dars_wasm.js' {
  export default function initialize(): Promise<{ memory: WebAssembly.Memory }>;
  export function evaluate_json(expression: string): string;
  export function evaluate_value_json(expression: string, bindings: string): string;
  export function combine_values_json(left: string, right: string, subtract: boolean): string;
}

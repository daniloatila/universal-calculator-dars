declare module '*dars_wasm.js' {
  export default function initialize(): Promise<unknown>;
  export function evaluate_json(expression: string): string;
}

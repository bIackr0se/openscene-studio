type WebMcpSchema = Record<string, unknown>;

type WebMcpExecutionContext = {
  signal: AbortSignal;
};

type WebMcpTool = {
  name: string;
  title?: string;
  description: string;
  inputSchema: WebMcpSchema;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  execute: (
    input: Record<string, unknown>,
    context?: WebMcpExecutionContext,
  ) => unknown;
};

interface Document {
  modelContext?: {
    registerTool: (
      tool: WebMcpTool,
      options?: { signal?: AbortSignal },
    ) => void | Promise<void>;
  };
}

interface Window {
  __OPENSCENE__?: {
    toolNames: string[];
    inspect: () => unknown;
  };
}

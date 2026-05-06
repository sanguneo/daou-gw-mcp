#!/usr/bin/env node
interface McpReq {
    jsonrpc?: string;
    id?: unknown;
    method: string;
    params?: {
        name?: string;
        arguments?: Record<string, unknown>;
    };
}
interface McpResp {
    jsonrpc: '2.0';
    id?: unknown;
    result?: unknown;
    error?: {
        code: number;
        message: string;
    };
}
declare function toolsList(): Promise<Record<string, unknown>[]>;
declare function handleMcpRequest(req: McpReq): Promise<McpResp>;

export { handleMcpRequest, toolsList };

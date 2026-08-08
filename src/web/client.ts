import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { type ContractRouterClient } from "@orpc/contract";
import type { apiContract } from "../shared/api";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { getToken } from "./lib/auth";

const link = new RPCLink({
  url: "http://localhost:5170/rpc",
  headers: () => {
    const token = getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  },
  interceptors: [
    // 1. Custom Logger Interceptor
    async ({ path, input, next }) => {
      // In oRPC, path is typically an array of strings (e.g., ['todo', 'list'])
      const route = Array.isArray(path) ? path.join(".") : String(path);

      console.log(`🚀 [oRPC Request] ${route}`, input ?? "<no input>");
      const start = performance.now();

      try {
        // Await the actual network request
        const response = await next();
        const duration = (performance.now() - start).toFixed(2);

        console.log(`✅ [oRPC Response] ${route} (${duration}ms)`, response);

        // You MUST return the response so the calling code receives the data!
        return response;
      } catch (error) {
        const duration = (performance.now() - start).toFixed(2);

        // AbortError is expected: React Query aborts in-flight requests when
        // the query key changes, the component unmounts, or TanStack Router
        // preloads a route on hover/intent and then navigates elsewhere.
        // Don't log these as errors — they are normal cancellations.
        const isAbort =
          error instanceof DOMException && error.name === "AbortError";

        if (!isAbort) {
          console.error(`❌ [oRPC Error] ${route} (${duration}ms)`, error);
        } else {
          console.debug(`⏭️ [oRPC Aborted] ${route} (${duration}ms)`);
        }

        // Rethrow the error so TanStack Query and your app can catch/display it
        throw error;
      }
    },
    onError((error) => {
      // Skip AbortError — these are normal React Query cancellations, not
      // real errors (see the logger interceptor above for details).
      const isAbort =
        error instanceof DOMException && error.name === "AbortError";
      if (!isAbort) {
        console.error("Global oRPC Error Handler:", error);
      }
    }),
  ],
});

export const client: ContractRouterClient<typeof apiContract> =
  createORPCClient(link);

/**
 * TanStack Query integration for oRPC. Use this for all web→backend calls, e.g.:
 *   useQuery(orpc.todo.list.queryOptions({ input: {...} }))
 *   useMutation(orpc.todo.create.mutationOptions())
 *   queryClient.invalidateQueries({ queryKey: orpc.todo.key() })
 */
export const orpc = createTanstackQueryUtils(client);

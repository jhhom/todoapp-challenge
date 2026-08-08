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
    onError((error) => {
      console.error(error);
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

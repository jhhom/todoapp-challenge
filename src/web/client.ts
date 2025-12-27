import { createORPCClient, onError } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { type ContractRouterClient } from "@orpc/contract";
import type { apiContract } from "../shared/api";

const link = new RPCLink({
  url: "http://localhost:3000/rpc",
  headers: () => ({
    authorization: "Bearer token",
  }),
  // fetch: <-- provide fetch polyfill fetch if needed
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

export const client: ContractRouterClient<typeof apiContract> =
  createORPCClient(link);

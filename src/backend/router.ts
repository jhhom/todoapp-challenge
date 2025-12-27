import { implement } from "@orpc/server";
import { apiContract } from "../shared/api";

const os = implement(apiContract);

export const router = os.router({
  createPerson: os.createPerson.handler(async ({ input }) => {
    return {
      id: 1,
      ...input,
    };
  }),
});

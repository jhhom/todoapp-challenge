import express from "express";
import cors from "cors";
import { RPCHandler } from "@orpc/server/node";
import { onError } from "@orpc/server";
import { router } from "./router";

const app = express();

app.use(cors());

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/rpc{/*path}", async (req, res, next) => {
  const { matched } = await handler.handle(req, res, {
    prefix: "/rpc",
    context: {},
  });

  if (matched) {
    return;
  }

  next();
});

app.listen(5170, () => console.log("Server listening on port 5170"));

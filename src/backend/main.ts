import express from "express";
import cors from "cors";
import { RPCHandler } from "@orpc/server/node";
import { OpenAPIHandler } from "@orpc/openapi/node";
import { onError } from "@orpc/server";
import { router } from "./router";
import { database } from "./db";
import { generateOpenAPISpec } from "./openapi";

const app = express();
app.use(cors());
app.use(express.json());

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
    context: { db: database, headers: req.headers },
  });
  if (matched) return;
  next();
});

// ── OpenAPI (REST) handler ─────────────────────────────────────────────
// Mounts the same router as a RESTful API at /api so third-party clients
// (curl, Postman, generated SDKs) can call it without the oRPC RPC client.
const openApiHandler = new OpenAPIHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error);
    }),
  ],
});

app.use("/api{/*path}", async (req, res, next) => {
  const { matched } = await openApiHandler.handle(req, res, {
    prefix: "/api",
    context: { db: database, headers: req.headers },
  });
  if (matched) return;
  next();
});

// Serve the generated OpenAPI 3.1.1 document.
// The spec is generated once on startup and cached for the lifetime of the
// process (it is a static representation of the router).
const cachedSpec = generateOpenAPISpec();

app.get("/openapi.json", async (_req, res) => {
  res.json(await cachedSpec);
});

app.listen(5170, () =>
  console.log(
    "Server listening on port 5170\n" +
      "  RPC:   http://localhost:5170/rpc\n" +
      "  REST:  http://localhost:5170/api\n" +
      "  Spec:  http://localhost:5170/openapi.json",
  ),
);

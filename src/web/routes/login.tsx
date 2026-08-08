import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "../client";
import { setToken, clearToken } from "../lib/auth";

export const Route = createFileRoute("/login")({ component: LoginPage });

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Auth call goes through the TanStack Query utils in src/web/client.ts.
  const login = useMutation(
    orpc.auth.login.mutationOptions({
      onSuccess: (data) => {
        setToken(data.token);
        navigate({ to: "/" });
      },
      onError: () => clearToken(),
    }),
  );

  return (
    <div className="mx-auto mt-20 max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-bold">Log in</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ email, password });
        }}
        className="space-y-3"
      >
        <input
          className="w-full rounded border p-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded border p-2"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {login.isError && (
          <p className="text-sm text-destructive">Invalid credentials.</p>
        )}
        <button
          type="submit"
          className="w-full rounded bg-primary p-2 text-primary-foreground"
        >
          Log in
        </button>
      </form>
      <button
        className="w-full text-sm text-blue-600 underline"
        onClick={() => navigate({ to: "/register" })}
      >
        Need an account? Register
      </button>
    </div>
  );
}

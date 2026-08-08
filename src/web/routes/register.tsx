import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { orpc } from "../client";
import { setToken, clearToken } from "../lib/auth";

export const Route = createFileRoute("/register")({ component: RegisterPage });

export default function RegisterPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  // Auth call goes through the TanStack Query utils in src/web/client.ts.
  const register = useMutation(
    orpc.auth.register.mutationOptions({
      onSuccess: (data) => {
        setToken(data.token);
        navigate({ to: "/" });
      },
      onError: () => {
        clearToken();
        setError("Registration failed. Email may already be registered.");
      },
    }),
  );

  return (
    <div className="mx-auto mt-20 max-w-sm space-y-4 p-4">
      <h1 className="text-2xl font-bold">Register</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length < 8) {
            setError("Password must be at least 8 characters.");
            return;
          }
          setError("");
          register.mutate({ email, password });
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
          placeholder="Password (min 8 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <button
          type="submit"
          className="w-full rounded bg-primary p-2 text-primary-foreground"
        >
          Register
        </button>
      </form>
    </div>
  );
}

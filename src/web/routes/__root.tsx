import {
  createRootRoute,
  Outlet,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { getToken } from "../lib/auth";

export const Route = createRootRoute({
  component: RootComponent,
});

function RootComponent() {
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const isAuthRoute = pathname === "/login" || pathname === "/register";
    const hasToken = !!getToken();
    if (!hasToken && !isAuthRoute) {
      router.navigate({ to: "/login" });
    } else if (hasToken && isAuthRoute) {
      router.navigate({ to: "/" });
    }
  }, [pathname, router]);

  return <Outlet />;
}

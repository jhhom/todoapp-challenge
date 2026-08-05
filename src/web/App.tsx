import { useEffect } from "react";
import { routeTree } from "./routeTree.gen";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import "./App.css";

// Set up a Router instance
const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
});

function App() {
  useEffect(() => {}, []);

  return (
    <>
      <RouterProvider router={router} />
    </>
  );
}

export default App;

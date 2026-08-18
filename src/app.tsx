// @refresh reload
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { Suspense } from "solid-js";
import LogoutBubble from "~/components/logout-bubble";
import "./app.css";

export default function App() {
  return (
    <Router
      root={props => (
        <Suspense>
          {props.children}
          <LogoutBubble />
        </Suspense>
      )}
    >
      <FileRoutes />
    </Router>
  );
}

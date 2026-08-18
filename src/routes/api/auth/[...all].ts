import { auth } from "~/lib/auth";
import { toSolidStartHandler } from "better-auth/solid-start";

export const { GET, POST, PATCH, PUT, DELETE } = toSolidStartHandler(auth);

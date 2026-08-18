import { action, query } from "@solidjs/router";
import {
  getOptionalUser as gOU,
  getDashData as gDD,
  getHackatimeProjects as gHP,
  getMyProjects as gMP,
  getLeaderboard as gLB,
  submitProject as sP,
  logout as l
} from "./server";

export const getOptionalUser = query(gOU, "optionalUser");
export const getDashData = query(gDD, "dashData");
export const getHackatimeProjects = query(gHP, "hackatimeProjects");
export const getMyProjects = query(gMP, "myProjects");
export const getLeaderboard = query(gLB, "leaderboard");
export const submitProject = action(sP, "submitProject");
export const logout = action(l, "logout");

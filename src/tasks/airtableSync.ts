import { defineTask } from "nitro/task";
import { syncProjectsToAirtable } from "~/api/airtableSync";

export default defineTask({
  meta: {
    name: "airtable:sync",
    description: "Sync submitted projects to the YSWS Project Submission Airtable base"
  },
  async run() {
    await syncProjectsToAirtable();
    return { result: "ok" };
  }
});

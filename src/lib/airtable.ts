import { AirtableTs } from "airtable-ts";

export const airtable = new AirtableTs({
  apiKey: process.env.AIRTABLE_API_KEY!
});

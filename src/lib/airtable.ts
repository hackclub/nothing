import { AirtableTs } from "airtable-ts";

const base = new AirtableTs({
  apiKey: process.env.AIRTABLE_API_KEY!
})
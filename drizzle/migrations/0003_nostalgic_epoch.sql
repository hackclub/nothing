DROP INDEX "account_issuer_accountId_uidx";--> statement-breakpoint
CREATE UNIQUE INDEX "account_providerId_accountId_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
ALTER TABLE "account" DROP COLUMN "issuer";
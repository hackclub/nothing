CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text DEFAULT '' NOT NULL,
	"password" text DEFAULT '' NOT NULL
);

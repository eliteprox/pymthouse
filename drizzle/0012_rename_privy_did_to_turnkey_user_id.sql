-- Rename Privy identity columns to Turnkey session user id (JWT `user_id` claim).
ALTER TABLE "users" RENAME COLUMN "privy_did" TO "turnkey_user_id";
ALTER TABLE "end_users" RENAME COLUMN "privy_did" TO "turnkey_user_id";
ALTER INDEX "users_privy_did_unique" RENAME TO "users_turnkey_user_id_unique";
ALTER INDEX "end_users_privy_did_unique" RENAME TO "end_users_turnkey_user_id_unique";
UPDATE "users" SET "oauth_provider" = 'turnkey-wallet' WHERE "oauth_provider" = 'privy-wallet';

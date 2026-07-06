-- migration file: add remark column to accounts
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS remark text;

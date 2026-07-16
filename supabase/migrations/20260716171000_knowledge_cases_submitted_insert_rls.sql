BEGIN;

DROP POLICY IF EXISTS "knowledge_cases_insert" ON public.knowledge_cases;

CREATE POLICY "knowledge_cases_insert"
  ON public.knowledge_cases
  FOR INSERT
  WITH CHECK (
    auth.role() = 'authenticated'
    AND submitted_by = auth.uid()
    AND status = 'submitted'
    AND (account_id IS NULL OR public.owns_account(account_id))
  );

COMMIT;

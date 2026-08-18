-- 允许成员提交自己的豁免申请
create policy "成员提交自己的豁免申请"
  on public.exemption_request
  for insert
  to authenticated
  with check (
    applicant_user_id = auth.uid()
    and team_id is not null
  );

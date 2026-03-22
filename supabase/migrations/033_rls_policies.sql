-- 033: RLS policies for script/tag/ai/team/exemption/audit domain tables

-- =============================
-- script_document
-- =============================
drop policy if exists "通过内容项继承读取脚本文档权限" on public.script_document;
drop policy if exists "仅管理员写入脚本文档" on public.script_document;
drop policy if exists "仅管理员更新脚本文档" on public.script_document;
drop policy if exists "仅管理员删除脚本文档" on public.script_document;

create policy "通过内容项继承读取脚本文档权限"
  on public.script_document
  for select
  using (
    exists (
      select 1
      from public.content_item
      where content_item.id = script_document.content_item_id
        and (
          content_item.owner_user_id = auth.uid()
          or public.is_admin()
          or exists (
            select 1
            from public.submission_batch
            where submission_batch.id = content_item.batch_id
              and submission_batch.submitter_user_id = auth.uid()
          )
        )
    )
  );

create policy "仅管理员写入脚本文档"
  on public.script_document
  for insert
  with check (public.is_admin());

create policy "仅管理员更新脚本文档"
  on public.script_document
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除脚本文档"
  on public.script_document
  for delete
  using (public.is_admin());

-- =============================
-- script_segment
-- =============================
drop policy if exists "通过脚本文档继承读取脚本分段权限" on public.script_segment;
drop policy if exists "仅管理员写入脚本分段" on public.script_segment;
drop policy if exists "仅管理员更新脚本分段" on public.script_segment;
drop policy if exists "仅管理员删除脚本分段" on public.script_segment;

create policy "通过脚本文档继承读取脚本分段权限"
  on public.script_segment
  for select
  using (
    exists (
      select 1
      from public.script_document
      join public.content_item
        on content_item.id = script_document.content_item_id
      where script_document.id = script_segment.script_document_id
        and (
          content_item.owner_user_id = auth.uid()
          or public.is_admin()
          or exists (
            select 1
            from public.submission_batch
            where submission_batch.id = content_item.batch_id
              and submission_batch.submitter_user_id = auth.uid()
          )
        )
    )
  );

create policy "仅管理员写入脚本分段"
  on public.script_segment
  for insert
  with check (public.is_admin());

create policy "仅管理员更新脚本分段"
  on public.script_segment
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除脚本分段"
  on public.script_segment
  for delete
  using (public.is_admin());

-- =============================
-- tag_definition
-- =============================
drop policy if exists "已登录用户可读取标签定义" on public.tag_definition;
drop policy if exists "仅管理员写入标签定义" on public.tag_definition;
drop policy if exists "仅管理员更新标签定义" on public.tag_definition;
drop policy if exists "仅管理员删除标签定义" on public.tag_definition;

create policy "已登录用户可读取标签定义"
  on public.tag_definition
  for select
  using (auth.uid() is not null);

create policy "仅管理员写入标签定义"
  on public.tag_definition
  for insert
  with check (public.is_admin());

create policy "仅管理员更新标签定义"
  on public.tag_definition
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除标签定义"
  on public.tag_definition
  for delete
  using (public.is_admin());

-- =============================
-- ai_input_bundle
-- =============================
drop policy if exists "用户可读取自己的AI输入包" on public.ai_input_bundle;
drop policy if exists "用户可写入自己的AI输入包" on public.ai_input_bundle;
drop policy if exists "用户可按范围读取AI输入包" on public.ai_input_bundle;
drop policy if exists "用户可按范围写入AI输入包" on public.ai_input_bundle;
drop policy if exists "仅管理员更新AI输入包" on public.ai_input_bundle;
drop policy if exists "仅管理员删除AI输入包" on public.ai_input_bundle;

create policy "用户可按范围读取AI输入包"
  on public.ai_input_bundle
  for select
  using (
    public.is_admin()
    or (
      insight_scope = 'single_video'
      and exists (
        select 1
        from public.content_item
        where content_item.id = ai_input_bundle.scope_entity_id
          and (
            content_item.owner_user_id = auth.uid()
            or exists (
              select 1
              from public.submission_batch
              where submission_batch.id = content_item.batch_id
                and submission_batch.submitter_user_id = auth.uid()
            )
          )
      )
    )
    or (
      -- member_week/member_month 的 scope_entity_id 统一为 account_id
      insight_scope in ('member_week', 'member_month')
      and exists (
        select 1
        from public.content_item
        where content_item.account_id = ai_input_bundle.scope_entity_id
          and content_item.owner_user_id = auth.uid()
      )
    )
    or (
      -- team_week/team_month 的 scope_entity_id 统一为 team_id
      insight_scope in ('team_week', 'team_month')
      and exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.team_id = ai_input_bundle.scope_entity_id
      )
    )
  );

create policy "用户可按范围写入AI输入包"
  on public.ai_input_bundle
  for insert
  with check (
    public.is_admin()
    or (
      insight_scope = 'single_video'
      and exists (
        select 1
        from public.content_item
        where content_item.id = ai_input_bundle.scope_entity_id
          and (
            content_item.owner_user_id = auth.uid()
            or exists (
              select 1
              from public.submission_batch
              where submission_batch.id = content_item.batch_id
                and submission_batch.submitter_user_id = auth.uid()
            )
          )
      )
    )
    or (
      insight_scope in ('member_week', 'member_month')
      and exists (
        select 1
        from public.content_item
        where content_item.account_id = ai_input_bundle.scope_entity_id
          and content_item.owner_user_id = auth.uid()
      )
    )
    or (
      insight_scope in ('team_week', 'team_month')
      and exists (
        select 1
        from public.profiles
        where profiles.id = auth.uid()
          and profiles.team_id = ai_input_bundle.scope_entity_id
      )
    )
  );

create policy "仅管理员更新AI输入包"
  on public.ai_input_bundle
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除AI输入包"
  on public.ai_input_bundle
  for delete
  using (public.is_admin());

-- =============================
-- ai_insight_result
-- =============================
drop policy if exists "用户可读取自己的AI洞察结果" on public.ai_insight_result;
drop policy if exists "用户可写入自己的AI洞察结果" on public.ai_insight_result;
drop policy if exists "用户可按范围读取AI洞察结果" on public.ai_insight_result;
drop policy if exists "用户可按范围写入AI洞察结果" on public.ai_insight_result;
drop policy if exists "仅管理员更新AI洞察结果" on public.ai_insight_result;
drop policy if exists "仅管理员删除AI洞察结果" on public.ai_insight_result;

create policy "用户可按范围读取AI洞察结果"
  on public.ai_insight_result
  for select
  using (
    exists (
      select 1
      from public.ai_input_bundle
      where ai_input_bundle.id = ai_insight_result.input_bundle_id
        and (
          public.is_admin()
          or (
            ai_input_bundle.insight_scope = 'single_video'
            and exists (
              select 1
              from public.content_item
              where content_item.id = ai_input_bundle.scope_entity_id
                and (
                  content_item.owner_user_id = auth.uid()
                  or exists (
                    select 1
                    from public.submission_batch
                    where submission_batch.id = content_item.batch_id
                      and submission_batch.submitter_user_id = auth.uid()
                  )
                )
            )
          )
          or (
            ai_input_bundle.insight_scope in ('member_week', 'member_month')
            and exists (
              select 1
              from public.content_item
              where content_item.account_id = ai_input_bundle.scope_entity_id
                and content_item.owner_user_id = auth.uid()
            )
          )
          or (
            ai_input_bundle.insight_scope in ('team_week', 'team_month')
            and exists (
              select 1
              from public.profiles
              where profiles.id = auth.uid()
                and profiles.team_id = ai_input_bundle.scope_entity_id
            )
          )
        )
    )
  );

create policy "用户可按范围写入AI洞察结果"
  on public.ai_insight_result
  for insert
  with check (
    exists (
      select 1
      from public.ai_input_bundle
      where ai_input_bundle.id = ai_insight_result.input_bundle_id
        and (
          public.is_admin()
          or (
            ai_input_bundle.insight_scope = 'single_video'
            and exists (
              select 1
              from public.content_item
              where content_item.id = ai_input_bundle.scope_entity_id
                and (
                  content_item.owner_user_id = auth.uid()
                  or exists (
                    select 1
                    from public.submission_batch
                    where submission_batch.id = content_item.batch_id
                      and submission_batch.submitter_user_id = auth.uid()
                  )
                )
            )
          )
          or (
            ai_input_bundle.insight_scope in ('member_week', 'member_month')
            and exists (
              select 1
              from public.content_item
              where content_item.account_id = ai_input_bundle.scope_entity_id
                and content_item.owner_user_id = auth.uid()
            )
          )
          or (
            ai_input_bundle.insight_scope in ('team_week', 'team_month')
            and exists (
              select 1
              from public.profiles
              where profiles.id = auth.uid()
                and profiles.team_id = ai_input_bundle.scope_entity_id
            )
          )
        )
    )
  );

create policy "仅管理员更新AI洞察结果"
  on public.ai_insight_result
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除AI洞察结果"
  on public.ai_insight_result
  for delete
  using (public.is_admin());

-- =============================
-- teams
-- =============================
drop policy if exists "成员读取所属团队或演示团队" on public.teams;
drop policy if exists "仅管理员写入团队" on public.teams;
drop policy if exists "仅管理员更新团队" on public.teams;
drop policy if exists "仅管理员删除团队" on public.teams;

create policy "成员读取所属团队或演示团队"
  on public.teams
  for select
  using (
    public.is_admin()
    or teams.is_demo = true
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.team_id = teams.id
    )
  );

create policy "仅管理员写入团队"
  on public.teams
  for insert
  with check (public.is_admin());

create policy "仅管理员更新团队"
  on public.teams
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除团队"
  on public.teams
  for delete
  using (public.is_admin());

-- =============================
-- groups
-- =============================
drop policy if exists "成员读取所属团队分组" on public.groups;
drop policy if exists "仅管理员写入分组" on public.groups;
drop policy if exists "仅管理员更新分组" on public.groups;
drop policy if exists "仅管理员删除分组" on public.groups;

create policy "成员读取所属团队分组"
  on public.groups
  for select
  using (
    public.is_admin()
    or exists (
      select 1
      from public.profiles
      where profiles.id = auth.uid()
        and profiles.team_id = groups.team_id
    )
  );

create policy "仅管理员写入分组"
  on public.groups
  for insert
  with check (public.is_admin());

create policy "仅管理员更新分组"
  on public.groups
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除分组"
  on public.groups
  for delete
  using (public.is_admin());

-- =============================
-- exemption_request
-- =============================
drop policy if exists "成员读取自己的豁免申请" on public.exemption_request;
drop policy if exists "成员提交自己的豁免申请" on public.exemption_request;
drop policy if exists "仅管理员审核豁免申请" on public.exemption_request;
drop policy if exists "仅管理员删除豁免申请" on public.exemption_request;

create policy "成员读取自己的豁免申请"
  on public.exemption_request
  for select
  using (
    applicant_user_id = auth.uid()
    or public.is_admin()
  );

create policy "成员提交自己的豁免申请"
  on public.exemption_request
  for insert
  with check (
    applicant_user_id = auth.uid()
    or public.is_admin()
  );

create policy "仅管理员审核豁免申请"
  on public.exemption_request
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除豁免申请"
  on public.exemption_request
  for delete
  using (public.is_admin());

-- =============================
-- exemption_grant
-- =============================
drop policy if exists "成员读取自己的豁免授予" on public.exemption_grant;
drop policy if exists "仅管理员写入豁免授予" on public.exemption_grant;
drop policy if exists "仅管理员更新豁免授予" on public.exemption_grant;
drop policy if exists "仅管理员删除豁免授予" on public.exemption_grant;

create policy "成员读取自己的豁免授予"
  on public.exemption_grant
  for select
  using (
    user_id = auth.uid()
    or public.is_admin()
  );

create policy "仅管理员写入豁免授予"
  on public.exemption_grant
  for insert
  with check (public.is_admin());

create policy "仅管理员更新豁免授予"
  on public.exemption_grant
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除豁免授予"
  on public.exemption_grant
  for delete
  using (public.is_admin());

-- =============================
-- audit_log
-- =============================
drop policy if exists "仅有审计权限者可读审计日志" on public.audit_log;
drop policy if exists "仅管理员写入审计日志" on public.audit_log;
drop policy if exists "仅管理员更新审计日志" on public.audit_log;
drop policy if exists "仅管理员删除审计日志" on public.audit_log;

create policy "仅有审计权限者可读审计日志"
  on public.audit_log
  for select
  using (public.has_permission('view_audit_log'));

create policy "仅管理员写入审计日志"
  on public.audit_log
  for insert
  with check (public.is_admin());

create policy "仅管理员更新审计日志"
  on public.audit_log
  for update
  using (public.is_admin())
  with check (public.is_admin());

create policy "仅管理员删除审计日志"
  on public.audit_log
  for delete
  using (public.is_admin());

-- 045: 文案改写 workflow step 支持步骤级展示模型

alter table public.rewrite_workflow_steps
  add column if not exists model_view_id uuid references public.rewrite_model_views(id) on delete set null;

create index if not exists idx_rewrite_workflow_steps_model_view_id
  on public.rewrite_workflow_steps(model_view_id);

update public.rewrite_workflow_steps as steps
set
  model_view_id = views.id,
  updated_at = timezone('utc'::text, now())
from public.rewrite_workflows as workflows,
     public.rewrite_model_views as views
where steps.workflow_id = workflows.id
  and workflows.key = 'default_auto_rewrite'
  and (
    (steps.step_key = 'structure' and views.key = 'opus')
    or (steps.step_key = 'polish' and views.key = 'gemini')
  )
  and steps.model_view_id is distinct from views.id;

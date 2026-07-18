create or replace function public.submit_feedback_card_reply(
  p_card_id uuid,
  p_actor_user_id uuid,
  p_reply_status text,
  p_reply_text text
)
returns setof public.content_feedback_cards
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_card public.content_feedback_cards%rowtype;
  v_now timestamptz := now();
begin
  if p_reply_status not in ('acknowledged', 'disputed') then
    raise exception '回复状态不正确';
  end if;

  if nullif(trim(p_reply_text), '') is null then
    raise exception '回复内容不能为空';
  end if;

  select *
  into v_card
  from public.content_feedback_cards
  where id = p_card_id
  for update;

  if not found then
    raise exception '反馈卡不存在';
  end if;

  if v_card.target_user_id <> p_actor_user_id then
    raise exception '无权限回复这张反馈卡';
  end if;

  if v_card.card_status not in ('sent', 'viewed') then
    raise exception '反馈卡还未下发，暂不能回传复盘';
  end if;

  insert into public.feedback_card_replies (
    feedback_card_id,
    reply_status,
    reply_text,
    replied_by
  ) values (
    p_card_id,
    p_reply_status,
    trim(p_reply_text),
    p_actor_user_id
  );

  update public.content_feedback_cards
  set
    card_status = case when card_status = 'sent' then 'viewed' else card_status end,
    viewed_at = coalesce(viewed_at, v_now),
    employee_reply_status = p_reply_status,
    employee_reply_text = trim(p_reply_text),
    employee_replied_at = v_now,
    employee_replied_by = p_actor_user_id
  where id = p_card_id
  returning * into v_card;

  return next v_card;
end;
$$;

revoke all on function public.submit_feedback_card_reply(uuid, uuid, text, text) from public;
revoke all on function public.submit_feedback_card_reply(uuid, uuid, text, text) from anon;
revoke all on function public.submit_feedback_card_reply(uuid, uuid, text, text) from authenticated;
grant execute on function public.submit_feedback_card_reply(uuid, uuid, text, text) to service_role;

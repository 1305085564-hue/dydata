import { PREFIX, uuid } from './permission-fixtures.mjs';

const ACTOR_ID = uuid(6);
const TEAM_ID = uuid(101);
const FIXTURE_DATE = '2999-01-01';
const marker = (table, suffix = 'row') => `${PREFIX}-b05-${table}-${suffix}`;

// Keep these IDs stable for exact manifest-backed cleanup. UUID IDs occupy the
// approved synthetic range 20000+, while non-UUID primary keys are explicit.
const FIXTURE_TABLES = [
  'accounts', 'admin_actions', 'advice_actions', 'ai_channels', 'ai_feature_bindings',
  'ai_feature_config', 'ai_feature_config_archives', 'ai_feedback', 'ai_input_bundle',
  'ai_insight_result', 'ai_provider_key_models', 'ai_provider_keys', 'ai_providers',
  'ai_result', 'audit_logs', 'content_asset', 'content_item', 'content_observations', 'content_tag_link',
  'daily_reports', 'exemption_audit', 'exemption_grant', 'exemption_request',
  'exemption_request_date', 'fulfillment_appeals', 'fulfillment_records', 'invite_codes',
  'market_context_daily', 'member_change_log', 'metric_snapshot', 'notifications',
  'profiles', 'profiles_group', 'profiles_team', 'provisional_tag_text', 'publish_drafts',
  'remind_logs', 'rewrite_conversation_skills', 'rewrite_conversations',
  'rewrite_document_paragraphs', 'rewrite_document_revisions', 'rewrite_documents',
  'rewrite_generation_runs', 'rewrite_messages', 'rewrite_model_routes',
  'rewrite_model_views', 'rewrite_modes', 'rewrite_skill_versions', 'rewrite_skills',
  'sample_quality_issues', 'script_document', 'script_purposes', 'script_usage_records',
  'sop_checkpoint_submissions', 'sop_daily_status', 'system_issues', 'tag_definition',
  'team_join_requests', 'teams', 'usage_events', 'video_content_segments',
  'video_metrics_snapshots', 'video_review_tickets', 'video_screenshot_replacement_history',
  'video_tags', 'videos', 'violation_case_reason_tags', 'violation_case_visual_tags',
  'violation_cases', 'violation_events', 'violation_reason_tags', 'visual_tags',
  'weekly_decisions', 'work_submissions', 'yike_areas', 'yike_execution_slots',
  'yike_item_events', 'yike_items', 'yike_people', 'yike_projects', 'yike_workspaces',
];

const FIXTURE_ID = Object.fromEntries(
  FIXTURE_TABLES.map((table, index) => [table, uuid(20_000 + index)]),
);
const id = table => FIXTURE_ID[table];
const byId = (table, fields, patch, extra = {}) => ({
  table,
  key: { id: id(table) },
  insert: { id: id(table), ...fields },
  patch,
  ...extra,
});

/**
 * Build payload-only descriptors for the 80 writable base tables.
 * No SQL is executed here. Seed parents before children; every linked row is
 * either this registry's row, blocked synthetic actor uuid(6), or team uuid(101).
 */
export function buildWriteFixtures() {
  return [
    // Identity and account roots. The blocked auth/profile identity already
    // exists; profile INSERT is not granted and must never be replayed here.
    byId('teams', { name: marker('teams'), is_demo: true }, { name: marker('teams', 'updated') }),
    byId('accounts', { profile_id: ACTOR_ID, name: marker('accounts') }, { content_direction: marker('accounts', 'updated') }),
    {
      table: 'profiles', key: { id: ACTOR_ID },
      insert: { id: ACTOR_ID, name: marker('profiles'), role: 'member', company_role: 'member', membership_status: 'active' },
      patch: { name: marker('profiles', 'updated') }, existing: true,
    },
    {
      table: 'sub_topic_claims',
      key: { id: uuid(26_001) },
      insert: { id: uuid(26_001), sub_topic_id: uuid(401), user_id: ACTOR_ID, status: 'writing' },
      patch: null,
      support: true,
    },
    {
      table: 'profiles_team',
      key: { profile_id: ACTOR_ID, team_id: TEAM_ID },
      insert: { profile_id: ACTOR_ID, team_id: TEAM_ID },
      // This link table has only its two key columns in the live catalog.
      patch: { team_id: id('teams') },
    },
    {
      table: 'profiles_group',
      key: { profile_id: ACTOR_ID, group_id: uuid(21_000) },
      insert: { profile_id: ACTOR_ID, group_id: uuid(21_000) },
      // The live catalog has no non-key column or group FK for this link table.
      patch: { group_id: uuid(21_001) },
    },

    // Content and video parents used by the dependent evidence rows below.
    byId('content_item', { owner: ACTOR_ID, title: marker('content_item'), body: marker('content_item', 'body') }, null, { support: true }),
    byId('tag_definition', { name: marker('tag_definition'), description: marker('tag_definition', 'description') }, { description: marker('tag_definition', 'updated') }),
    byId('videos', { account_id: id('accounts'), user_id: ACTOR_ID, video_title: marker('videos'), review_status: 'pending' }, { video_title: marker('videos', 'updated') }),
    byId('daily_reports', {
      user_id: ACTOR_ID, account_id: id('accounts'), report_date: FIXTURE_DATE,
      title: marker('daily_reports'), submitter: marker('daily_reports', 'submitter'),
      video_id: id('videos'), review_status: 'pending', is_void: false,
    }, { title: marker('daily_reports', 'updated') }),
    byId('content_asset', { content_item_id: id('content_item'), file_path: `${marker('content_asset')}/fixture.txt` }, { file_path: `${marker('content_asset', 'updated')}/fixture.txt` }),
    byId('content_observations', { video_id: id('videos'), observer_id: ACTOR_ID, note: marker('content_observations') }, { note: marker('content_observations', 'updated') }),
    {
      table: 'content_tag_link',
      key: { content_item_id: id('content_item'), tag_id: id('tag_definition') },
      insert: { content_item_id: id('content_item'), tag_id: id('tag_definition') },
      // No non-key column exists. Even assigning the same key requires UPDATE.
      patch: { tag_id: id('tag_definition') },
    },
    byId('metric_snapshot', { content_item_id: id('content_item'), metric_name: marker('metric_snapshot'), metric_value: 1 }, { metric_value: 2 }),
    byId('provisional_tag_text', { content_item_id: id('content_item'), suggested_text: marker('provisional_tag_text'), submitted_by: ACTOR_ID }, { suggested_text: marker('provisional_tag_text', 'updated') }),
    byId('video_content_segments', {
      video_id: id('videos'), segment_type: '开头钩子', segment_text: marker('video_content_segments'),
      segment_order: 0, estimated_start_sec: 0, estimated_end_sec: 3,
    }, { segment_text: marker('video_content_segments', 'updated') }),
    byId('video_metrics_snapshots', { video_id: id('videos'), snapshot_type: '24h', play_count: 1 }, { play_count: 2 }),
    byId('video_tags', { video_id: id('videos'), tag_dimension: '题材', tag_value: marker('video_tags'), source: 'manual', confidence: 0.5 }, { tag_value: marker('video_tags', 'updated') }),
    byId('video_screenshot_replacement_history', {
      video_id: id('videos'), account_id: id('accounts'), user_id: ACTOR_ID, replaced_by: ACTOR_ID,
      role: 'screenshot_1', replaced_at: `${FIXTURE_DATE}T00:00:00.000Z`,
      old_url: 'https://example.invalid/dydata-b05/old', new_url: 'https://example.invalid/dydata-b05/new',
    }, { old_url: 'https://example.invalid/dydata-b05/updated' }),
    byId('video_review_tickets', {
      video_id: id('videos'), reporter_id: ACTOR_ID, assignee_id: ACTOR_ID,
      issue_tag: marker('video_review_tickets'), status: 'withdrawn',
    }, { issue_tag: marker('video_review_tickets', 'updated') }),
    byId('sample_quality_issues', { report_id: id('daily_reports'), video_id: id('videos'), severity: 'warning' }, { severity: 'critical' }),

    // AI configuration rows are unique, disabled, and carry only unusable keys
    // and reserved non-routable endpoints. No task/job table is started.
    byId('ai_channels', {
      name: marker('ai_channels'), base_url: 'https://example.invalid', api_key: 'synthetic-invalid-key',
      is_enabled: false, priority: 9999,
    }, { last_error_message: marker('ai_channels', 'updated') }),
    byId('ai_providers', { name: marker('ai_providers'), base_url: 'https://example.invalid', is_enabled: false }, { description: marker('ai_providers', 'updated') }),
    byId('ai_provider_keys', {
      provider_id: id('ai_providers'), label: marker('ai_provider_keys'), api_key: 'synthetic-invalid-key',
      is_enabled: false,
    }, { label: marker('ai_provider_keys', 'updated') }),
    byId('ai_provider_key_models', { key_id: id('ai_provider_keys'), model_id: marker('ai_provider_key_models'), display_name: marker('ai_provider_key_models', 'display'), is_enabled: false }, { display_name: marker('ai_provider_key_models', 'updated') }),
    byId('ai_feature_config', { feature_key: marker('ai_feature_config'), label: marker('ai_feature_config', 'label'), is_enabled: false, lifecycle_state: 'archived' }, { system_prompt: marker('ai_feature_config', 'updated') }),
    byId('ai_feature_bindings', { feature_key: marker('ai_feature_bindings'), label: marker('ai_feature_bindings', 'label'), provider_key_model_id: id('ai_provider_key_models'), is_enabled: false, lifecycle_state: 'archived' }, { system_prompt: marker('ai_feature_bindings', 'updated') }),
    byId('ai_feature_config_archives', {
      feature_key: marker('ai_feature_config_archives'), source_table: 'ai_feature_config',
      snapshot: { fixture: true }, archived_reason: marker('ai_feature_config_archives', 'reason'),
    }, { archived_reason: marker('ai_feature_config_archives', 'updated') }),
    byId('ai_input_bundle', {
      content_item_id: id('content_item'), insight_scope: 'single_video',
      input_json: { fixture: true }, data_quality_state: 'sufficient',
    }, { input_json: { fixture: true, updated: true } }),
    byId('ai_insight_result', { input_bundle_id: id('ai_input_bundle'), insight_type: 'content_analysis', result_status: 'failed', result_json: { fixture: true } }, { rendered_text: marker('ai_insight_result', 'updated') }),
    byId('ai_result', { ai_input_bundle_id: id('ai_input_bundle'), result: { fixture: true } }, { result: { fixture: true, updated: true } }),
    byId('ai_feedback', { ai_result_id: id('ai_result'), submitted_by: ACTOR_ID, feedback: { fixture: true } }, { feedback: { fixture: true, updated: true } }),

    // Exemption and fulfillment rows share only the synthetic actor/account,
    // use a reserved date, and avoid active/pending queues where possible.
    byId('exemption_request', {
      profile_id: ACTOR_ID, applicant_user_id: ACTOR_ID, team_id: TEAM_ID,
      exemption_type: 'range', start_date: FIXTURE_DATE, end_date: FIXTURE_DATE,
      reason: marker('exemption_request'), request_status: 'pending', status: 'pending',
      exemption_category: 'waive',
    }, { reason: marker('exemption_request', 'updated') }),
    byId('exemption_request_date', { request_id: id('exemption_request'), request_date: FIXTURE_DATE, status: 'pending', reason: marker('exemption_request_date') }, { reason: marker('exemption_request_date', 'updated') }),
    byId('exemption_grant', {
      request_id: id('exemption_request'), user_id: ACTOR_ID, team_id: TEAM_ID,
      start_date: FIXTURE_DATE, end_date: FIXTURE_DATE, grant_type: 'range', status: 'inactive', exemption_category: 'waive',
    }, { end_date: '2999-01-02' }),
    byId('exemption_audit', { exemption_request_id: id('exemption_request'), changed_by: ACTOR_ID, note: marker('exemption_audit') }, { note: marker('exemption_audit', 'updated') }),
    byId('fulfillment_records', { user_id: ACTOR_ID, team_id: TEAM_ID, record_date: FIXTURE_DATE, status: 'leave', reason: marker('fulfillment_records') }, { reason: marker('fulfillment_records', 'updated') }),
    byId('fulfillment_appeals', {
      user_id: ACTOR_ID, account_id: id('accounts'), record_date: FIXTURE_DATE,
      reason: marker('fulfillment_appeals'), status: 'rejected', decision_reason: marker('fulfillment_appeals', 'closed'),
    }, { reason: marker('fulfillment_appeals', 'updated') }),
    byId('team_join_requests', {
      applicant_user_id: ACTOR_ID, target_team_id: TEAM_ID, status: 'rejected', review_note: marker('team_join_requests'),
    }, { review_note: marker('team_join_requests', 'updated') }),
    byId('notifications', {
      user_id: ACTOR_ID, type: marker('notifications'), category: 'feed', severity: 'info',
      title: marker('notifications', 'title'), body: marker('notifications', 'body'), status: 'read',
      source_type: marker('notifications', 'source'), source_id: marker('notifications', 'source-id'),
    }, { title: marker('notifications', 'updated') }),
    byId('publish_drafts', {submitted_by:ACTOR_ID,account_id:id('accounts'),team_id:TEAM_ID,script_text:marker('publish_drafts'),status:'rejected',is_deleted:true}, {script_text:marker('publish_drafts','updated')}),
    byId('invite_codes', { code: marker('invite_codes'), created_by: ACTOR_ID, used_by: ACTOR_ID, used: true, used_at: `${FIXTURE_DATE}T00:00:00.000Z` }, { code: marker('invite_codes', 'updated') }),
    byId('remind_logs', { target_date: FIXTURE_DATE, user_id: ACTOR_ID, user_name: marker('remind_logs'), status: 'failed', response_body: marker('remind_logs', 'response') }, { response_body: marker('remind_logs', 'updated') }),
    byId('market_context_daily', { context_date: FIXTURE_DATE, is_trading_day: false, market_change: { fixture: true }, market_sentiment: '中', source: 'manual', updated_by: ACTOR_ID }, { market_change: { fixture: true, updated: true } }),
    byId('member_change_log', { profile_id: ACTOR_ID, change_type: marker('member_change_log'), action_type: 'add', change_payload: { fixture: true }, audit_fields: { fixture: true } }, { change_payload: { fixture: true, updated: true } }),
    byId('audit_logs', { user_id: ACTOR_ID, action: marker('audit_logs'), target: marker('audit_logs', 'target'), detail: marker('audit_logs', 'detail') }, { detail: marker('audit_logs', 'updated') }),
    byId('admin_actions', {
      conversation_id: marker('admin_actions'), admin_id: ACTOR_ID,
      action_type: 'query', action_category: 'diagnosis', description: marker('admin_actions', 'description'),
      tool_name: marker('admin_actions', 'tool'), result: 'cancelled',
    }, { description: marker('admin_actions', 'updated') }),
    byId('advice_actions', { target_user_id: ACTOR_ID, target_account_id: id('accounts'), advice_content: marker('advice_actions'), advice_source: 'manager', status: '已忽略' }, { advice_content: marker('advice_actions', 'updated') }),
    {table:'usage_events',key:{id:'-620260001'},insert:{id:'-620260001',user_id:ACTOR_ID,path:'/__fixture__/dydata-permission-v2-b05',event_type:'page_view'},patch:{path:'/__fixture__/dydata-permission-v2-b05-updated'}},
    byId('weekly_decisions', { week_start: FIXTURE_DATE, generated_by: 'manual', promote: [{ fixture: true }] }, { promote: [{ fixture: true, updated: true }] }),
    byId('work_submissions', { user_id: ACTOR_ID, team_id: TEAM_ID, submit_date: FIXTURE_DATE, content_text: marker('work_submissions') }, { content_text: marker('work_submissions', 'updated') }),
    byId('sop_daily_status', { user_id: ACTOR_ID, team_id: TEAM_ID, status_date: FIXTURE_DATE, current_blocker: 'TOPIC', topic_status: 'PENDING' }, { topic_status: 'SUBMITTED' }),
    byId('sop_checkpoint_submissions', {
      user_id: ACTOR_ID, team_id: TEAM_ID, status_date: FIXTURE_DATE, checkpoint: 'TOPIC',
      topic_text: marker('sop_checkpoint_submissions'), review_status: 'REJECTED',
    }, { notes: marker('sop_checkpoint_submissions', 'updated') }),
    byId('system_issues', {
      reported_by: ACTOR_ID, issue_type: 'code_bug', description: marker('system_issues'),
      related_action_id: id('admin_actions'), status: 'wont_fix', resolution_notes: marker('system_issues', 'closed'),
    }, { description: marker('system_issues', 'updated') }),

    // Rewrite graph is entirely synthetic and disabled from model routing.
    byId('rewrite_model_views', { key: marker('rewrite_model_views'), label: marker('rewrite_model_views', 'label'), is_enabled: false, is_default: false }, { label: marker('rewrite_model_views', 'updated') }),
    byId('rewrite_modes', { key: marker('rewrite_modes'), name: marker('rewrite_modes', 'name'), mode_prompt: marker('rewrite_modes'), is_enabled: false, is_default: false }, { name: marker('rewrite_modes', 'updated') }),
    byId('rewrite_model_routes', {
      model_view_id: id('rewrite_model_views'), channel_id: id('ai_channels'), actual_model: marker('rewrite_model_routes'),
      priority: 9999, weight: 1, is_enabled: false,
    }, { actual_model: marker('rewrite_model_routes', 'updated') }),
    byId('rewrite_skills', { scope: 'private', owner_id: ACTOR_ID, key: marker('rewrite_skills'), name: marker('rewrite_skills', 'name'), is_enabled: false }, { name: marker('rewrite_skills', 'updated') }),
    byId('rewrite_skill_versions', { skill_id: id('rewrite_skills'), version: 1, system_prompt: marker('rewrite_skill_versions') }, { system_prompt: marker('rewrite_skill_versions', 'updated') }),
    byId('rewrite_conversations', { user_id: ACTOR_ID, title: marker('rewrite_conversations'), auto_mode_enabled: false }, { title: marker('rewrite_conversations', 'updated') }),
    byId('rewrite_messages', { conversation_id: id('rewrite_conversations'), user_id: ACTOR_ID, role: 'user', generation_mode: 'single', message_status: 'failed', content: marker('rewrite_messages'), error_message: marker('rewrite_messages', 'cancelled') }, { content: marker('rewrite_messages', 'updated') }),
    byId('rewrite_documents', { conversation_id: id('rewrite_conversations'), title: marker('rewrite_documents') }, { title: marker('rewrite_documents', 'updated') }),
    byId('rewrite_document_revisions', { document_id: id('rewrite_documents'), source_type: 'user_edit', status: 'aborted', full_content: marker('rewrite_document_revisions') }, { full_content: marker('rewrite_document_revisions', 'updated') }),
    byId('rewrite_document_paragraphs', { revision_id: id('rewrite_document_revisions'), paragraph_id: marker('rewrite_document_paragraphs'), position: 0, content: marker('rewrite_document_paragraphs'), source_type: 'user' }, { content: marker('rewrite_document_paragraphs', 'updated') }),
    byId('rewrite_conversation_skills', { conversation_id: id('rewrite_conversations'), skill_id: id('rewrite_skills'), skill_version_id: id('rewrite_skill_versions'), position: 20000 }, { position: 20001 }),
    byId('rewrite_generation_runs', { conversation_id: id('rewrite_conversations'), user_id: ACTOR_ID, run_type: 'chat_reply', status: 'aborted', error_message: marker('rewrite_generation_runs') }, { error_message: marker('rewrite_generation_runs', 'updated') }),

    // Violation/script evidence uses only synthetic case/tag rows. The usage
    // aggregate trigger therefore recalculates this fixture case only.
    byId('violation_cases', {
      submitted_by: ACTOR_ID, script_text: marker('violation_cases'), category: '其他',
      purpose: 'violation', script_format: 'mixed', status: 'archived', usage_state: 'testing',
      risk_level: 'low', source_video_id: id('videos'), scene_description: marker('violation_cases', 'scene'),
    }, { scene_description: marker('violation_cases', 'updated') }),
    byId('violation_reason_tags', { name: marker('violation_reason_tags'), is_active: true }, { sort_order: 20_001 }),
    byId('visual_tags', { name: marker('visual_tags'), description: marker('visual_tags', 'description'), created_by: ACTOR_ID }, { description: marker('visual_tags', 'updated') }),
    {
      table: 'violation_case_reason_tags',
      key: { case_id: id('violation_cases'), tag_id: id('violation_reason_tags') },
      insert: { case_id: id('violation_cases'), tag_id: id('violation_reason_tags') },
      patch: { created_at: `${FIXTURE_DATE}T00:00:00.000Z` },
    },
    {
      table: 'violation_case_visual_tags',
      key: { case_id: id('violation_cases'), tag_id: id('visual_tags') },
      insert: { case_id: id('violation_cases'), tag_id: id('visual_tags') },
      patch: { created_at: `${FIXTURE_DATE}T00:00:00.000Z` },
    },
    byId('violation_events', {
      case_id: id('violation_cases'), account_id: id('accounts'), event_type: '其他',
      occurred_at: `${FIXTURE_DATE}T00:00:00.000Z`, reported_by: ACTOR_ID, note: marker('violation_events'),
    }, { note: marker('violation_events', 'updated') }),
    byId('script_document', { title: marker('script_document'), body: marker('script_document', 'body') }, { body: marker('script_document', 'updated') }),
    {
      table: 'script_purposes',
      key: { key: marker('script_purposes') },
      insert: { key: marker('script_purposes'), label: marker('script_purposes', 'label'), is_active: false },
      patch: { label: marker('script_purposes', 'updated') },
    },
    byId('script_usage_records', {
      case_id: id('violation_cases'), recorded_by: ACTOR_ID, account_id: id('accounts'), team_id: TEAM_ID,
      used_at: FIXTURE_DATE, views: 1, follows: 0, source: 'manual', note: marker('script_usage_records'),
    }, { note: marker('script_usage_records', 'updated') }),

    // Yike graph: all rows are owned by the blocked synthetic identity; task
    // is completed and model/notification side effects are not involved.
    byId('yike_workspaces', { user_id: ACTOR_ID, name: marker('yike_workspaces') }, { name: marker('yike_workspaces', 'updated') }),
    byId('yike_areas', { workspace_id: id('yike_workspaces'), user_id: ACTOR_ID, name: marker('yike_areas') }, { name: marker('yike_areas', 'updated') }),
    byId('yike_projects', { workspace_id: id('yike_workspaces'), user_id: ACTOR_ID, area_id: id('yike_areas'), name: marker('yike_projects') }, { goal_note: marker('yike_projects', 'updated') }),
    byId('yike_people', { workspace_id: id('yike_workspaces'), user_id: ACTOR_ID, name: marker('yike_people') }, { name: marker('yike_people', 'updated') }),
    byId('yike_items', {
      workspace_id: id('yike_workspaces'), user_id: ACTOR_ID, item_type: 'task', status: 'done',
      title: marker('yike_items'), complexity: 'quick', time_bucket: 'later', memo_granularity: 'unknown',
      area_id: id('yike_areas'), project_id: id('yike_projects'), completed_at: `${FIXTURE_DATE}T00:00:00.000Z`,
    }, { title: marker('yike_items', 'updated') }),
    byId('yike_execution_slots', {
      workspace_id: id('yike_workspaces'), user_id: ACTOR_ID, slot_key: 'primary_task',
      item_id: id('yike_items'), project_id: null, filled_reason: 'manual',
    }, { filled_reason: 'auto' }),
    byId('yike_item_events', {
      workspace_id: id('yike_workspaces'), user_id: ACTOR_ID, item_id: id('yike_items'),
      project_id: id('yike_projects'), event_type: 'fixture_created',
      before_json: { fixture: true }, after_json: { fixture: true },
    }, { after_json: { fixture: true, updated: true } }),
  ];
}

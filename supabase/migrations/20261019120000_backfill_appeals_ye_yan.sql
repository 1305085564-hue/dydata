-- ============================================================================
-- 补录：叶颜 10-08 补交申请中审批通过但未落库的 3 条日报
-- 生成时间：2026-10-19
-- 背景：10-08 11:16-11:24 叶颜提交 10-01~10-07 共 7 条补交申请，11:28 全部获批；
--       审批后的自动续交全部失败（提交入口报错），payload 原样留在 fulfillment_appeals。
--       她随后在 10-12 / 10-14 手工重交了其中 3 条，按发布时间落在 10-01 / 10-03 / 10-05，
--       于是 09-30 / 10-02 / 10-04 三个日期至今空白。
-- 依据：交付口径「归属日 = 发布时间的上海日期」，三条的真实发布时间分别是
--       09-30 13:58 / 10-02 10:20 / 10-04 09:09，故归属日应为 09-30 / 10-02 / 10-04。
-- 10-06 不在本迁移内：由叶颜本人重新提交。
--
-- 注意：
--   1. id 使用提交链路的稳定 UUID（sha256 指纹），重复执行不会二次写入；
--   2. 原截图的存储对象已于清理中删除（从未被任何记录引用），故快照不写 screenshot_urls，
--      指标数据完整来自她当时的补交 payload；
--   3. uploaded_at / created_at 取她真实提交补交申请的瞬间（10-08），不是本次执行时间；
--   4. 回滚见 supabase/rollback/20261019120000_backfill_appeals_ye_yan.sql。
-- ============================================================================

begin;

create table if not exists public.appeal_backfill_20261019_ledger (
  report_id uuid primary key,
  video_id uuid not null,
  appeal_id uuid not null,
  appeal_date date not null,
  report_date date not null,
  video_title text,
  play_count integer,
  screenshot_restored boolean not null default false,
  applied_at timestamptz not null default now(),
  note text
);

-- ---------------------------------------------------------------------------
-- 2026-10-04 ｜ 放量下跌 ｜ 播放 3397 ｜ 申请日 2026-10-05
-- ---------------------------------------------------------------------------
insert into public.videos (
  id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at,
  anomaly_status, punish_type, platform_notice, topic_id, lifecycle_state, review_status,
  created_at, script_author_user_id, video_editor_user_id, operator_user_id
) values (
  $txt$d2b3b86a-442a-5098-875f-12d6e222cf76$txt$, $txt$70af4850-7cd6-4d81-95b4-1a1abfe465d0$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, null, $txt$放量下跌$txt$, $txt$放量下跌跟缩量下跌，到底哪一个是陷阱，哪一个才是机会呢？这个问题你要是答不上来，你听我一句劝，你先别炒股了，连成交量这种最基本的门道你都摸不清楚，那么你冲进来只会是给主力送人头，特别是当下这种分化严重的行情，量价这个技巧你搞不明白，你就去炒股，那就等于闭上眼睛上高速。 但是今天你只要把以下的这7句话你记住了，往后不管是牛市还是熊市，还是震荡摸底，那么盈利都跟呼吸一样简单。
老粉儿都知道啊，我早期是纯技术派出身，早年在机构做盘面复盘工作，专门辅助操盘手做数据统计。说句实话，我不是什么天赋型选手，刚接触实盘的时候呢，我也是亏得想跳楼的那个韭菜，那个时候我有一个致命的误区，总以为跌了就是机会，涨了就是风险，只要是大跌，诶，我就觉得捡漏的机会来了，无脑低吸，越跌越补。最惨的一次，三个月亏了70多万，那账户里头只剩20万。想不到每天盯盘七八个小时，晚上睡不着，白天不敢看盘，我是又后悔又不甘，明明每天认真复盘，认真看盘，学的技术指标也不少，难道技术分析根本就没有屁用吗？股市全都是靠运气博弈。
后来真正把我点醒的是带我入行的一个机构老操盘手，他算是我半个师傅，我自己实在是想不明白，我就去找他吃饭，大吐苦水，他放下筷子，只说了一句话，你分不清下跌的性质，是因为你没搞懂成交量和价格之间的关系。你太看重价格了，只看涨跌价格买卖，完全忽略了成交量，这个是非常危险的。价格可以被主力对倒，又多又空做出来，但是成交量是真实的换手，资金进出是骗不了人的。
这里我有7句话，你背下来，回去对着盘面啃三个月，如果说没用你来找我，我当时也是半信半疑啊，还是老老实实的背下来了，结果呢，三个月之后，账户从20万变到了35万，半年之后突破了60万，那一刻我。才明白啊，原来量价关系才是股市里头最不会骗人的语言。后来我开始带徒弟，第一个教的就是这7句话。有个全职炒股的老粉丝啊，炒股8年，账户本来是20多万，折腾了一年多亏的就只剩五六万了。他就是典型的看不懂下跌，一跌就慌，一慌就乱操作。后来找到我，我没有教他复杂的战法，我只让他死记硬背这7句量价口诀，让他每天开盘之前背一遍，对着盘面硬啃。他咬着牙做了两个月不到，账户从5万干到了11万。他打电话跟我说，三姐原来看量价真的是不用再提心吊胆了。今天我毫无保留的把这7句话我也教给你。但是在我分享之前啊，咱们做一个君子之约。第一点亮小红心，让大数据知道你在认真学习以后，平台会继续给你推送有用的干货。第二，留下一句量价为王，让我看到你想赚钱的决心。第三，第一次刷到我的朋友，点上一个小关小注三姐只讲散户听得懂，用得上。的干货带你少走10年的弯路。下面我直接讲干货啊，
记好了第一句，低价无量要等，高价无量要拿。
第二句，低价放量要跟上，高价放量要跑路。
第三句，量增价升要买入。
第四句，量缩价升要持有。
第五句，量增价跌要减仓。
第六句，量平价跌要出局。
第七句，量平价升要加仓。你能把这个视频看完，说明你的内核足够稳，一定要点上小红心，收藏好以后每次盘面下跌，拿捏不准走势的时候呢，你就翻出来对照一遍这7句话，你只要彻底啃透了，足够你在股市里头吃一辈子了。我是三姐啊，不讲空洞的大道理，只分享散户能落地，能用得上的实战干货，点关注不吃亏，我们明天见。$txt$,
  $txt$2026-10-04T01:09:00.000Z$txt$::timestamptz, $txt$2026-10-08T03:23:27.239Z$txt$::timestamptz,
  $txt$normal$txt$, null, null, null, 'active', 'pending',
  $txt$2026-10-08T03:23:27.239Z$txt$::timestamptz, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$
) on conflict (id) do nothing;

insert into public.video_metrics_snapshots (
  video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain,
  follower_loss, follower_convert, homepage_visits, avg_play_duration, completion_rate,
  bounce_rate_2s, completion_rate_5s, vs_previous, screenshot_urls, retention_screenshot_url
) select
  $txt$d2b3b86a-442a-5098-875f-12d6e222cf76$txt$, $txt$24h$txt$, 3397, 163, 15,
  8, 125, 0, 0,
  null, 0, 26, 3.42,
  34.84, 32.08, $txt${"published_at_text":"2026-10-04 09:09 发布","ocr_summary":{"screenshot_1":{"likes":163,"shares":8,"comments":15,"favorites":125,"play_count":3397,"published_at":"2026-10-04T01:09:00.000Z","published_at_text":"2026-10-04 09:09 发布","published_at_confidence":"high"},"screenshot_2":{"confidence":0.95,"recognized":true,"published_at":"2026-10-04T01:09:00.000Z","published_at_text":"2026-10-04 09:09 发布","retention_metrics":{"bounce_rate_2s":34.84,"completion_rate":3.42,"avg_play_duration":26,"completion_rate_5s":32.08},"published_at_confidence":"high"}},"ocr_assets":[{"role":"screenshot_1","screenshot_type":"data","confidence_score":0.83,"confirmed":true,"recognized_fields":{"likes":163,"shares":8,"comments":15,"favorites":125,"play_count":3397,"published_at":"2026-10-04T01:09:00.000Z","published_at_text":"2026-10-04 09:09 发布","published_at_confidence":"high"}},{"role":"screenshot_2","screenshot_type":"retention","confidence_score":0.95,"confirmed":true,"recognized_fields":{"confidence":0.95,"recognized":true,"published_at":"2026-10-04T01:09:00.000Z","published_at_text":"2026-10-04 09:09 发布","retention_metrics":{"bounce_rate_2s":34.84,"completion_rate":3.42,"avg_play_duration":26,"completion_rate_5s":32.08},"published_at_confidence":"high"}}]}$txt$::jsonb, null, null
where not exists (select 1 from public.video_metrics_snapshots where video_id = $txt$d2b3b86a-442a-5098-875f-12d6e222cf76$txt$);

insert into public.daily_reports (
  id, user_id, report_date, video_id, title, submitter, play_count, likes, comments, shares,
  favorites, follower_gain, follower_convert, completion_rate, avg_play_duration, bounce_rate_2s,
  completion_rate_5s, content, published_at, uploaded_at, account_id, created_at,
  data_source, submit_source, script_author_user_id, video_editor_user_id, operator_user_id
) values (
  $txt$9e4e3534-4cec-56bd-856b-b06435f6ccd0$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$2026-10-04$txt$, $txt$d2b3b86a-442a-5098-875f-12d6e222cf76$txt$, $txt$放量下跌$txt$, $txt$叶颜$txt$,
  3397, 163, 15, 8, 125,
  0, null,
  $txt$3.42%$txt$, $txt$26秒$txt$, $txt$34.84%$txt$, $txt$32.08%$txt$,
  $txt$放量下跌跟缩量下跌，到底哪一个是陷阱，哪一个才是机会呢？这个问题你要是答不上来，你听我一句劝，你先别炒股了，连成交量这种最基本的门道你都摸不清楚，那么你冲进来只会是给主力送人头，特别是当下这种分化严重的行情，量价这个技巧你搞不明白，你就去炒股，那就等于闭上眼睛上高速。 但是今天你只要把以下的这7句话你记住了，往后不管是牛市还是熊市，还是震荡摸底，那么盈利都跟呼吸一样简单。
老粉儿都知道啊，我早期是纯技术派出身，早年在机构做盘面复盘工作，专门辅助操盘手做数据统计。说句实话，我不是什么天赋型选手，刚接触实盘的时候呢，我也是亏得想跳楼的那个韭菜，那个时候我有一个致命的误区，总以为跌了就是机会，涨了就是风险，只要是大跌，诶，我就觉得捡漏的机会来了，无脑低吸，越跌越补。最惨的一次，三个月亏了70多万，那账户里头只剩20万。想不到每天盯盘七八个小时，晚上睡不着，白天不敢看盘，我是又后悔又不甘，明明每天认真复盘，认真看盘，学的技术指标也不少，难道技术分析根本就没有屁用吗？股市全都是靠运气博弈。
后来真正把我点醒的是带我入行的一个机构老操盘手，他算是我半个师傅，我自己实在是想不明白，我就去找他吃饭，大吐苦水，他放下筷子，只说了一句话，你分不清下跌的性质，是因为你没搞懂成交量和价格之间的关系。你太看重价格了，只看涨跌价格买卖，完全忽略了成交量，这个是非常危险的。价格可以被主力对倒，又多又空做出来，但是成交量是真实的换手，资金进出是骗不了人的。
这里我有7句话，你背下来，回去对着盘面啃三个月，如果说没用你来找我，我当时也是半信半疑啊，还是老老实实的背下来了，结果呢，三个月之后，账户从20万变到了35万，半年之后突破了60万，那一刻我。才明白啊，原来量价关系才是股市里头最不会骗人的语言。后来我开始带徒弟，第一个教的就是这7句话。有个全职炒股的老粉丝啊，炒股8年，账户本来是20多万，折腾了一年多亏的就只剩五六万了。他就是典型的看不懂下跌，一跌就慌，一慌就乱操作。后来找到我，我没有教他复杂的战法，我只让他死记硬背这7句量价口诀，让他每天开盘之前背一遍，对着盘面硬啃。他咬着牙做了两个月不到，账户从5万干到了11万。他打电话跟我说，三姐原来看量价真的是不用再提心吊胆了。今天我毫无保留的把这7句话我也教给你。但是在我分享之前啊，咱们做一个君子之约。第一点亮小红心，让大数据知道你在认真学习以后，平台会继续给你推送有用的干货。第二，留下一句量价为王，让我看到你想赚钱的决心。第三，第一次刷到我的朋友，点上一个小关小注三姐只讲散户听得懂，用得上。的干货带你少走10年的弯路。下面我直接讲干货啊，
记好了第一句，低价无量要等，高价无量要拿。
第二句，低价放量要跟上，高价放量要跑路。
第三句，量增价升要买入。
第四句，量缩价升要持有。
第五句，量增价跌要减仓。
第六句，量平价跌要出局。
第七句，量平价升要加仓。你能把这个视频看完，说明你的内核足够稳，一定要点上小红心，收藏好以后每次盘面下跌，拿捏不准走势的时候呢，你就翻出来对照一遍这7句话，你只要彻底啃透了，足够你在股市里头吃一辈子了。我是三姐啊，不讲空洞的大道理，只分享散户能落地，能用得上的实战干货，点关注不吃亏，我们明天见。$txt$, $txt$2026-10-04T01:09:00.000Z$txt$::timestamptz, $txt$2026-10-08T03:23:27.239Z$txt$::timestamptz, $txt$70af4850-7cd6-4d81-95b4-1a1abfe465d0$txt$,
  $txt$2026-10-08T03:23:27.239Z$txt$::timestamptz, 'manual', 'manual', $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$
) on conflict (id) do nothing;

insert into public.appeal_backfill_20261019_ledger (
  report_id, video_id, appeal_id, appeal_date, report_date, video_title, play_count, note
) values (
  $txt$9e4e3534-4cec-56bd-856b-b06435f6ccd0$txt$, $txt$d2b3b86a-442a-5098-875f-12d6e222cf76$txt$, $txt$84019030-9b7f-453e-8180-e46b3a1a9eef$txt$, $txt$2026-10-05$txt$, $txt$2026-10-04$txt$, $txt$放量下跌$txt$, 3397,
  '原截图存储对象已被清理，快照未写 screenshot_urls；指标来自 2026-10-08 补交 payload'
) on conflict (report_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2026-09-30 ｜ 9.30 如期而至 祝各位愉快 ｜ 播放 10000 ｜ 申请日 2026-10-01
-- ---------------------------------------------------------------------------
insert into public.videos (
  id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at,
  anomaly_status, punish_type, platform_notice, topic_id, lifecycle_state, review_status,
  created_at, script_author_user_id, video_editor_user_id, operator_user_id
) values (
  $txt$82fd4b25-3c29-5b47-9c3d-cb4d7dc35ed3$txt$, $txt$70af4850-7cd6-4d81-95b4-1a1abfe465d0$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, null, $txt$9.30 如期而至 祝各位愉快$txt$, $txt$怎么样，宝子们是不是跟我昨天说的一毛一样？地产来了吧？昨天跟你们交代的那么清楚，地产分歧的时候该干啥？有没有听劝啊？但如果说你错过了，没吃上这一口的也没关系啊。接下来我会把精华再说一遍。呃，至于下午怎么应对，也跟姐姐们交代一下，我不废话，但是你别忘了点小红心。第一下午的话，应该不会有太大的动作，但是如果说你们是手里比较重C的，或者说那种手里的创了新高的，就该减肥还是得减减肥。因为现在是一个缩量的轮动行情，今天回你家，明天回他家，后天就可能红他他家了，知道吗？就这种不确定性也是很高的。所以说，咱们就是见好就收。那么，第二呃，马上就国庆了，这也不能给大家，我也现在不是神仙，我也不能给你预判一下，就是国庆之后该怎么怎么样，那真的就是吹大牛了对吧？我只能说国庆期间如果说有任何消息面的第一手消息，我会跟大家随时汇报。另外呢，也会跟大家教一点平常你们想听的一些干货，到节前节后开盘前，我会给大家做一个梳理视频，就是会让大家大家心里有个底。所以呢，就这段时间，大家记得好好休息一下，嗯，不要想那么多，对吧，好好陪陪家人，出去旅旅游啊，对不对？多消费一下，说不定国庆之后市场就好了呢。行，今天先说这么多，那就先祝大家国庆愉快，嗯，后面的事情不见不散。那以上观点仅供大家参考，不构成任何投资建议，希望大家接下来有个愉快开心的假期。$txt$,
  $txt$2026-09-30T05:58:00.000Z$txt$::timestamptz, $txt$2026-10-08T03:16:56.175Z$txt$::timestamptz,
  $txt$normal$txt$, null, null, null, 'active', 'pending',
  $txt$2026-10-08T03:16:56.175Z$txt$::timestamptz, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$
) on conflict (id) do nothing;

insert into public.video_metrics_snapshots (
  video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain,
  follower_loss, follower_convert, homepage_visits, avg_play_duration, completion_rate,
  bounce_rate_2s, completion_rate_5s, vs_previous, screenshot_urls, retention_screenshot_url
) select
  $txt$82fd4b25-3c29-5b47-9c3d-cb4d7dc35ed3$txt$, $txt$24h$txt$, 10000, 294, 50,
  6, 43, 98, 0,
  null, 0, 14, 2.56,
  38.55, 40.22, $txt${"published_at_text":"2026-09-30 13:58 发布","ocr_summary":{"screenshot_1":{"likes":294,"shares":6,"comments":50,"favorites":43,"play_count":10000,"video_title":"9.30 如期而至 祝各位愉快","published_at":"2026-09-30T05:58:00.000Z","published_at_text":"2026-09-30 13:58 发布","published_at_confidence":"high"},"screenshot_2":{"confidence":0.95,"recognized":true,"video_title":"9.30 如期而至 祝各位愉快","published_at":"2026-09-30T05:58:00.000Z","published_at_text":"2026-09-30 13:58 发布","retention_metrics":{"bounce_rate_2s":38.55,"completion_rate":2.56,"avg_play_duration":14,"completion_rate_5s":40.22},"published_at_confidence":"high"}},"ocr_assets":[{"role":"screenshot_1","screenshot_type":"data","confidence_score":0.75,"confirmed":true,"recognized_fields":{"likes":294,"shares":6,"comments":50,"favorites":43,"play_count":10000,"video_title":"9.30 如期而至 祝各位愉快","published_at":"2026-09-30T05:58:00.000Z","published_at_text":"2026-09-30 13:58 发布","published_at_confidence":"high"}},{"role":"screenshot_2","screenshot_type":"retention","confidence_score":0.95,"confirmed":true,"recognized_fields":{"confidence":0.95,"recognized":true,"video_title":"9.30 如期而至 祝各位愉快","published_at":"2026-09-30T05:58:00.000Z","published_at_text":"2026-09-30 13:58 发布","retention_metrics":{"bounce_rate_2s":38.55,"completion_rate":2.56,"avg_play_duration":14,"completion_rate_5s":40.22},"published_at_confidence":"high"}}]}$txt$::jsonb, null, null
where not exists (select 1 from public.video_metrics_snapshots where video_id = $txt$82fd4b25-3c29-5b47-9c3d-cb4d7dc35ed3$txt$);

insert into public.daily_reports (
  id, user_id, report_date, video_id, title, submitter, play_count, likes, comments, shares,
  favorites, follower_gain, follower_convert, completion_rate, avg_play_duration, bounce_rate_2s,
  completion_rate_5s, content, published_at, uploaded_at, account_id, created_at,
  data_source, submit_source, script_author_user_id, video_editor_user_id, operator_user_id
) values (
  $txt$0415b102-5772-5785-876e-0b06ee13b5f3$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$2026-09-30$txt$, $txt$82fd4b25-3c29-5b47-9c3d-cb4d7dc35ed3$txt$, $txt$9.30 如期而至 祝各位愉快$txt$, $txt$叶颜$txt$,
  10000, 294, 50, 6, 43,
  98, null,
  $txt$2.56%$txt$, $txt$14秒$txt$, $txt$38.55%$txt$, $txt$40.22%$txt$,
  $txt$怎么样，宝子们是不是跟我昨天说的一毛一样？地产来了吧？昨天跟你们交代的那么清楚，地产分歧的时候该干啥？有没有听劝啊？但如果说你错过了，没吃上这一口的也没关系啊。接下来我会把精华再说一遍。呃，至于下午怎么应对，也跟姐姐们交代一下，我不废话，但是你别忘了点小红心。第一下午的话，应该不会有太大的动作，但是如果说你们是手里比较重C的，或者说那种手里的创了新高的，就该减肥还是得减减肥。因为现在是一个缩量的轮动行情，今天回你家，明天回他家，后天就可能红他他家了，知道吗？就这种不确定性也是很高的。所以说，咱们就是见好就收。那么，第二呃，马上就国庆了，这也不能给大家，我也现在不是神仙，我也不能给你预判一下，就是国庆之后该怎么怎么样，那真的就是吹大牛了对吧？我只能说国庆期间如果说有任何消息面的第一手消息，我会跟大家随时汇报。另外呢，也会跟大家教一点平常你们想听的一些干货，到节前节后开盘前，我会给大家做一个梳理视频，就是会让大家大家心里有个底。所以呢，就这段时间，大家记得好好休息一下，嗯，不要想那么多，对吧，好好陪陪家人，出去旅旅游啊，对不对？多消费一下，说不定国庆之后市场就好了呢。行，今天先说这么多，那就先祝大家国庆愉快，嗯，后面的事情不见不散。那以上观点仅供大家参考，不构成任何投资建议，希望大家接下来有个愉快开心的假期。$txt$, $txt$2026-09-30T05:58:00.000Z$txt$::timestamptz, $txt$2026-10-08T03:16:56.175Z$txt$::timestamptz, $txt$70af4850-7cd6-4d81-95b4-1a1abfe465d0$txt$,
  $txt$2026-10-08T03:16:56.175Z$txt$::timestamptz, 'manual', 'manual', $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$
) on conflict (id) do nothing;

insert into public.appeal_backfill_20261019_ledger (
  report_id, video_id, appeal_id, appeal_date, report_date, video_title, play_count, note
) values (
  $txt$0415b102-5772-5785-876e-0b06ee13b5f3$txt$, $txt$82fd4b25-3c29-5b47-9c3d-cb4d7dc35ed3$txt$, $txt$dbb58894-a1f5-471f-911b-3d1dfa0ac4d4$txt$, $txt$2026-10-01$txt$, $txt$2026-09-30$txt$, $txt$9.30 如期而至 祝各位愉快$txt$, 10000,
  '原截图存储对象已被清理，快照未写 screenshot_urls；指标来自 2026-10-08 补交 payload'
) on conflict (report_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2026-10-02 ｜ 成交量的秘密 ｜ 播放 4516 ｜ 申请日 2026-10-03
-- ---------------------------------------------------------------------------
insert into public.videos (
  id, account_id, user_id, video_url, video_title, content, published_at, uploaded_at,
  anomaly_status, punish_type, platform_notice, topic_id, lifecycle_state, review_status,
  created_at, script_author_user_id, video_editor_user_id, operator_user_id
) values (
  $txt$58c96681-69da-5cf0-b46d-7348e40b23ef$txt$, $txt$70af4850-7cd6-4d81-95b4-1a1abfe465d0$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, null, $txt$成交量的秘密$txt$, $txt$居然还有粉丝问我，量能要怎么看，我只讲一次啊，一只票下面的红绿柱子就是量，你先别管红的绿的，你只需要记住只要右边的柱子比左边的柱子高，就叫放量。右边的柱子比左边的柱子低，就叫缩量，缩量下跌，还会下跌，缩量上涨继续涨，  
放量上涨必然回调。放量下跌，必然反弹。缩量上涨，继续上涨。缩量下跌还会下跌。放量不涨。头部已现。缩量不跌，底部在此。你记住了吗？怕记住可以点赞收藏，关键时候能帮大忙$txt$,
  $txt$2026-10-02T02:20:00.000Z$txt$::timestamptz, $txt$2026-10-08T03:20:27.028Z$txt$::timestamptz,
  $txt$normal$txt$, null, null, null, 'active', 'pending',
  $txt$2026-10-08T03:20:27.028Z$txt$::timestamptz, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$
) on conflict (id) do nothing;

insert into public.video_metrics_snapshots (
  video_id, snapshot_type, play_count, likes, comments, shares, favorites, follower_gain,
  follower_loss, follower_convert, homepage_visits, avg_play_duration, completion_rate,
  bounce_rate_2s, completion_rate_5s, vs_previous, screenshot_urls, retention_screenshot_url
) select
  $txt$58c96681-69da-5cf0-b46d-7348e40b23ef$txt$, $txt$24h$txt$, 4516, 164, 8,
  22, 131, 1, 0,
  null, 0, 11, 10.78,
  45.6, 25.29, $txt${"published_at_text":"2026-10-02 10:20 发布","ocr_summary":{"screenshot_1":{"likes":164,"shares":22,"comments":8,"favorites":131,"play_count":4516,"video_title":"成交量的秘密","published_at":"2026-10-02T02:20:00.000Z","published_at_text":"2026-10-02 10:20 发布","published_at_confidence":"high"},"screenshot_2":{"confidence":0.95,"recognized":true,"video_title":"成交量的秘密","published_at":"2026-10-02T02:20:00.000Z","published_at_text":"2026-10-02 10:20 发布","retention_metrics":{"bounce_rate_2s":45.6,"completion_rate":10.78,"avg_play_duration":11,"completion_rate_5s":25.29},"published_at_confidence":"high"}},"ocr_assets":[{"role":"screenshot_1","screenshot_type":"data","confidence_score":0.83,"confirmed":true,"recognized_fields":{"likes":164,"shares":22,"comments":8,"favorites":131,"play_count":4516,"video_title":"成交量的秘密","published_at":"2026-10-02T02:20:00.000Z","published_at_text":"2026-10-02 10:20 发布","published_at_confidence":"high"}},{"role":"screenshot_2","screenshot_type":"retention","confidence_score":0.95,"confirmed":true,"recognized_fields":{"confidence":0.95,"recognized":true,"video_title":"成交量的秘密","published_at":"2026-10-02T02:20:00.000Z","published_at_text":"2026-10-02 10:20 发布","retention_metrics":{"bounce_rate_2s":45.6,"completion_rate":10.78,"avg_play_duration":11,"completion_rate_5s":25.29},"published_at_confidence":"high"}}]}$txt$::jsonb, null, null
where not exists (select 1 from public.video_metrics_snapshots where video_id = $txt$58c96681-69da-5cf0-b46d-7348e40b23ef$txt$);

insert into public.daily_reports (
  id, user_id, report_date, video_id, title, submitter, play_count, likes, comments, shares,
  favorites, follower_gain, follower_convert, completion_rate, avg_play_duration, bounce_rate_2s,
  completion_rate_5s, content, published_at, uploaded_at, account_id, created_at,
  data_source, submit_source, script_author_user_id, video_editor_user_id, operator_user_id
) values (
  $txt$d378582d-cc75-5a31-b009-11d3780c3e91$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$2026-10-02$txt$, $txt$58c96681-69da-5cf0-b46d-7348e40b23ef$txt$, $txt$成交量的秘密$txt$, $txt$叶颜$txt$,
  4516, 164, 8, 22, 131,
  1, null,
  $txt$10.78%$txt$, $txt$11秒$txt$, $txt$45.6%$txt$, $txt$25.29%$txt$,
  $txt$居然还有粉丝问我，量能要怎么看，我只讲一次啊，一只票下面的红绿柱子就是量，你先别管红的绿的，你只需要记住只要右边的柱子比左边的柱子高，就叫放量。右边的柱子比左边的柱子低，就叫缩量，缩量下跌，还会下跌，缩量上涨继续涨，  
放量上涨必然回调。放量下跌，必然反弹。缩量上涨，继续上涨。缩量下跌还会下跌。放量不涨。头部已现。缩量不跌，底部在此。你记住了吗？怕记住可以点赞收藏，关键时候能帮大忙$txt$, $txt$2026-10-02T02:20:00.000Z$txt$::timestamptz, $txt$2026-10-08T03:20:27.028Z$txt$::timestamptz, $txt$70af4850-7cd6-4d81-95b4-1a1abfe465d0$txt$,
  $txt$2026-10-08T03:20:27.028Z$txt$::timestamptz, 'manual', 'manual', $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$, $txt$629b5ad5-b1e2-495c-a5d8-b72e07da4558$txt$
) on conflict (id) do nothing;

insert into public.appeal_backfill_20261019_ledger (
  report_id, video_id, appeal_id, appeal_date, report_date, video_title, play_count, note
) values (
  $txt$d378582d-cc75-5a31-b009-11d3780c3e91$txt$, $txt$58c96681-69da-5cf0-b46d-7348e40b23ef$txt$, $txt$ae1d3ee7-cb45-4b38-976a-34dd068d4744$txt$, $txt$2026-10-03$txt$, $txt$2026-10-02$txt$, $txt$成交量的秘密$txt$, 4516,
  '原截图存储对象已被清理，快照未写 screenshot_urls；指标来自 2026-10-08 补交 payload'
) on conflict (report_id) do nothing;

-- ---------------------------------------------------------------------------
-- 执行后自检（不通过会直接抛出异常并回滚）
-- ---------------------------------------------------------------------------
do $$
declare v_rows int; v_bad int;
begin
  select count(*) into v_rows from public.daily_reports where id in ($txt$9e4e3534-4cec-56bd-856b-b06435f6ccd0$txt$, $txt$0415b102-5772-5785-876e-0b06ee13b5f3$txt$, $txt$d378582d-cc75-5a31-b009-11d3780c3e91$txt$);
  if v_rows <> 3 then
    raise exception '补录条数不符：期望 3 条，实际 % 条', v_rows;
  end if;
  select count(*) into v_bad from public.daily_reports
   where id in ($txt$9e4e3534-4cec-56bd-856b-b06435f6ccd0$txt$, $txt$0415b102-5772-5785-876e-0b06ee13b5f3$txt$, $txt$d378582d-cc75-5a31-b009-11d3780c3e91$txt$)
     and report_date <> (published_at at time zone 'Asia/Shanghai')::date;
  if v_bad > 0 then
    raise exception '有 % 条归属日与发布时间不一致', v_bad;
  end if;
end $$;

commit;

-- 验证：09-30 ~ 10-07 应连续无断档（10-06 待叶颜本人补交）
select d::date as 归属日, count(dr.id) as 条数, coalesce(string_agg(left(dr.title, 18), ' | '), '—') as 作品
  from generate_series('2026-09-28'::date, '2026-10-08'::date, '1 day') d
  left join public.daily_reports dr
    on dr.user_id = '629b5ad5-b1e2-495c-a5d8-b72e07da4558' and dr.report_date = d and dr.is_void = false
 group by d order by d;

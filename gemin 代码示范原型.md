<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>一刻 - 个人行动规划台</title>

​    <!-- Fonts -->
​    <link rel="preconnect" href="https://fonts.googleapis.com">
​    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
​    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
​    
​    <!-- Tailwind CSS -->
​    <script src="https://cdn.tailwindcss.com"></script>
​    <script>
​        tailwind.config = {
​            theme: {
​                extend: {
​                    fontFamily: {
​                        sans: ['Inter', 'system-ui', 'sans-serif'],
​                    },
​                    colors: {
​                        bgL0: '#F0F0F1',
​                        yike: {
​                            DEFAULT: '#D97757', // 暖橙色
​                            light: '#FDECE8',
​                            hover: '#C26547',
​                        },
​                        zinc: {
​                            450: '#8A8F98',
​                        }
​                    },
​                    boxShadow: {
​                        'soft': '0 4px 20px -2px rgba(0, 0, 0, 0.04)',
​                        'hover': '0 8px 30px -4px rgba(0, 0, 0, 0.08)',
​                        'focus': '0 0 0 2px rgba(217, 119, 87, 0.2)',
​                    }
​                }
​            }
​        }
​    </script>

​    <!-- React & ReactDOM -->
​    <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
​    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
​    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
​    <script src="https://unpkg.com/framer-motion@10.16.4/dist/framer-motion.js"></script>

    <style>
        body {
            background-color: #F0F0F1;
            scrollbar-width: thin;
            scrollbar-color: #cbd5e1 transparent;
            -webkit-font-smoothing: antialiased;
        }
        body::-webkit-scrollbar { width: 6px; height: 6px; }
        body::-webkit-scrollbar-track { background: transparent; }
        body::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; }

​        .hide-scroll::-webkit-scrollbar { display: none; }
​        .hide-scroll { -ms-overflow-style: none; scrollbar-width: none; }

​        /* 仪器卡尺感 - 空槽样式 */
​        .empty-slot-dashed {
​            background-image: linear-gradient(to right, #d4d4d8 50%, rgba(255,255,255,0) 0%), linear-gradient(#d4d4d8 50%, rgba(255,255,255,0) 0%), linear-gradient(to right, #d4d4d8 50%, rgba(255,255,255,0) 0%), linear-gradient(#d4d4d8 50%, rgba(255,255,255,0) 0%);
​            background-position: top, right, bottom, left;
​            background-repeat: repeat-x, repeat-y;
​            background-size: 8px 1px, 1px 8px;
​        }
​    </style>
</head>
<body>
​    <div id="root"></div>

    <script type="text/babel">
        const { useState, useEffect, useRef } = React;
        const { motion, AnimatePresence } = window.Motion;

​        const Icons = {
​            Logo: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-400"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>,
​            Send: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
​            Alert: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>,
​            Clock: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
​            Target: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>,
​            Split: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/></svg>,
​            Convert: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>,
​            Check: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
​            User: () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
​            Circle: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-300"><circle cx="12" cy="12" r="10"/></svg>,
​            CircleDot: () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-yike"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3" fill="currentColor"/></svg>
​        };

​        // 这模拟了 GET /api/yike/workbench 的返回结果
​        const MOCK_WORKBENCH = {
​            reminders: {
​                urgent: 1,
​                dueSoon: 2,
​                projectsMissingNextTask: [{ id: 'p1', name: '一刻上线' }],
​                memosSuggestSplit: [{ id: 'm1', title: '晨会三点记录' }]
​            },
​            drawerData: {
​                areas: [{ id: 'a1', name: '产品打磨' }, { id: 'a2', name: '内容方向' }],
​                projects: [{ id: 'p1', name: '一刻上线' }],
​                people: [{ id: 'u1', name: 'Codex' }, { id: 'u2', name: '设计组' }]
​            },
​            lanes: {
​                planned: [
​                    { id: 't2', title: '把后端方案交给 Codex', desc: '需确认鉴权细节', type: 'task', area: '产品打磨', complexity: '深度', timeBucket: '今天', isUrgent: false, isCandidate: true },
​                    { id: 'm1', title: '晨会三点记录', desc: '1. UI重构 2. API对接 3. 部署', type: 'memo', area: '管理', timeBucket: '今天', isMemoSplitSuggest: true, isCandidate: true },
​                    { id: 't3', title: '审核下周脚本选题', type: 'task', area: '内容方向', complexity: '小事', timeBucket: '本周', isUrgent: true, due: '2026-06-15' },
​                    { id: 't4', title: '确认域名解析', type: 'task', area: '基建', complexity: '随手', timeBucket: '本周' }
​                ],
​                doing: [
​                    // Index 0 会自动提权为主焦点任务
​                    { id: 't1', title: '整理一刻前端静态版', desc: '完成四个状态列的重构，接入模拟工作台数据，测试所有的微交互。', type: 'task', area: '产品打磨', project: '一刻上线', complexity: '深度', timeBucket: '今天' },
​                    { id: 't5', title: '回测昨日数据异动', type: 'task', area: '数据分析', complexity: '小事', timeBucket: '今天' }
​                ],
​                delegated: [
​                    { id: 't6', title: '设计首页入口图', type: 'task', area: '产品打磨', person: '设计组', timeBucket: '本周' },
​                    { id: 't7', title: '修复鉴权中间件 Bug', type: 'task', area: '后端支持', person: 'Codex', timeBucket: '今天', isUrgent: true }
​                ],
​                done: [
​                    { id: 't8', title: '定下一刻产品边界', type: 'task', area: '产品打磨', timeBucket: '昨天' }
​                ]
​            }
​        };

​        const staggerContainer = {
​            hidden: { opacity: 0 },
​            show: {
​                opacity: 1,
​                transition: { staggerChildren: 0.08 }
​            }
​        };

​        const fadeInY = {
​            hidden: { opacity: 0, y: 15 },
​            show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 300, damping: 24 } }
​        };

​        const RadarReminders = ({ reminders }) => {
​            if (!reminders) return null;
​            
​            return (
​                <div className="flex flex-wrap gap-2 mt-3 mb-6">
​                    {reminders.urgent > 0 && (
​                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 text-red-600 rounded-md text-xs font-medium border border-red-100">
​                            <Icons.Alert /> {reminders.urgent} 件事项加急
​                        </div>
​                    )}
​                    {reminders.dueSoon > 0 && (
​                        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-orange-50 text-orange-600 rounded-md text-xs font-medium border border-orange-100">
​                            <Icons.Clock /> {reminders.dueSoon} 件事项即将截止
​                        </div>
​                    )}
​                    {reminders.projectsMissingNextTask?.map(proj => (
​                        <button key={proj.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-yellow-50 text-yellow-700 hover:bg-yellow-100 transition-colors cursor-pointer rounded-md text-xs font-medium border border-yellow-100">
​                            <Icons.Target /> 项目【{proj.name}】缺下一步
​                        </button>
​                    ))}
​                    {reminders.memosSuggestSplit?.map(memo => (
​                        <button key={memo.id} className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-600 hover:bg-blue-100 transition-colors cursor-pointer rounded-md text-xs font-medium border border-blue-100">
​                            <Icons.Split /> 备忘【{memo.title}】建议拆分
​                        </button>
​                    ))}
​                </div>
​            );
​        };

​        const QuickInput = ({ onAdd }) => {
​            const [isFocused, setIsFocused] = useState(false);
​            const [val, setVal] = useState('');

​            const handleKeyDown = (e) => {
​                if (e.key === 'Enter' && val.trim()) {
​                    onAdd(val);
​                    setVal('');
​                }
​            };

​            return (
​                <motion.div variants={fadeInY} className="relative w-full z-20">
​                    <div className={`relative flex items-center w-full transition-all duration-300 rounded-2xl overflow-hidden ${isFocused ? 'bg-white shadow-soft ring-1 ring-yike/30' : 'bg-[#FAFAFB] border border-zinc-200'}`}>
​                        <input 
​                            type="text" 
​                            className="w-full bg-transparent outline-none py-4 pl-6 pr-12 text-zinc-800 placeholder:text-zinc-400 text-base"
​                            placeholder="把脑子里的下一件事丢进来 (Enter 保存)..."
​                            value={val}
​                            onChange={(e) => setVal(e.target.value)}
​                            onFocus={() => setIsFocused(true)}
​                            onBlur={() => setIsFocused(false)}
​                            onKeyDown={handleKeyDown}
​                        />
​                        <button 
​                            className={`absolute right-4 p-2 rounded-xl transition-colors ${val ? 'bg-yike text-white' : 'bg-zinc-100 text-zinc-400'}`}
​                            onClick={() => val.trim() && onAdd(val)}
​                        >
​                            <Icons.Send />
​                        </button>
​                    </div>
​                    {/* Focus Ritual Line */}
​                    <motion.div 
​                        initial={{ scaleX: 0 }}
​                        animate={{ scaleX: isFocused ? 1 : 0 }}
​                        transition={{ duration: 0.3, ease: "easeOut" }}
​                        className="absolute bottom-0 left-0 right-0 h-[2px] bg-yike rounded-b-2xl origin-left"
​                    />
​                </motion.div>
​            );
​        };

​        // The massively prominent card for the top Doing item
​        const PrimaryFocusCard = ({ item, onTransition }) => {
​            return (
​                <motion.div 
​                    layoutId={`task-${item.id}`}
​                    initial={{ opacity: 0, y: 10 }}
​                    animate={{ opacity: 1, y: 0 }}
​                    exit={{ opacity: 0, scale: 0.95, height: 0, overflow: 'hidden' }}
​                    className="relative bg-white rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-hover transition-all group overflow-hidden border border-white/50 mb-3"
​                >
​                    {/* Warm Orange Left Rail */}
​                    <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-yike/80 to-yike/30"></div>

                    <div className="flex justify-between items-start mb-3">
                        <span className="text-[11px] font-semibold text-zinc-400 tracking-wider uppercase">正在专注焦点</span>
                        <span className="text-xs font-medium text-yike bg-yike-light px-2.5 py-1 rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-yike animate-pulse"></span> 正在做
                        </span>
                    </div>
    
                    <h2 className="text-xl font-semibold text-zinc-900 mb-2 leading-tight">{item.title}</h2>
​                    {item.desc && <p className="text-sm text-zinc-500 mb-6 leading-relaxed line-clamp-2">{item.desc}</p>}

                    <div className="flex flex-wrap items-end justify-between gap-4 mt-6">
                        <div className="flex flex-wrap gap-2 text-xs">
                            {item.project && <span className="px-2 py-1 bg-zinc-100 text-zinc-600 rounded border border-zinc-200">项目: {item.project}</span>}
                            {item.area && <span className="px-2 py-1 bg-zinc-50 text-zinc-500 rounded border border-zinc-100">{item.area}</span>}
                            {item.complexity && <span className="px-2 py-1 bg-zinc-50 text-zinc-500 rounded border border-zinc-100">{item.complexity}</span>}
                        </div>
                        <button 
                            onClick={() => onTransition(item.id, 'done')}
                            className="shrink-0 flex items-center gap-1.5 px-5 py-2.5 rounded-xl border border-green-200 text-green-700 bg-green-50 hover:bg-green-100 transition-all text-sm font-semibold active:scale-95"
                        >
                            <Icons.Check /> 标记完成
                        </button>
                    </div>
​                </motion.div>
​            );
​        };

​        // Standard card for Planned, Delegated, Done, and secondary Doing items
​        const StandardCard = ({ item, status, onTransition, onConvert, onSplit }) => {
​            const isDone = status === 'done';
​            
​            return (
​                <motion.div 
​                    layoutId={`task-${item.id}`}
​                    initial={{ opacity: 0 }}
​                    animate={{ opacity: 1 }}
​                    exit={{ opacity: 0, scale: 0.95 }}
​                    className={`relative bg-white rounded-xl p-3.5 border transition-all group ${isDone ? 'opacity-50 border-transparent bg-white/50 grayscale' : 'border-zinc-100 hover:border-zinc-300 shadow-[0_2px_8px_-4px_rgba(0,0,0,0.04)] hover:shadow-soft'} ${item.isCandidate && !isDone ? 'ring-1 ring-yike/20 shadow-sm' : ''}`}
​                >
​                    {item.isCandidate && (
​                        <div className="absolute -top-2 right-3 px-1.5 py-0.5 bg-yike-light text-yike text-[10px] font-bold rounded">候选</div>
​                    )}

                    <div className="flex items-start gap-2 mb-1.5">
                        <div className="mt-0.5 shrink-0">
                            {isDone ? <Icons.Check /> : (status === 'doing' ? <Icons.CircleDot /> : <Icons.Circle />)}
                        </div>
                        <h3 className={`text-sm font-medium leading-snug ${isDone ? 'text-zinc-500 line-through' : 'text-zinc-800'}`}>
                            {item.title}
                        </h3>
                    </div>
    
                    <div className="pl-6 flex flex-col gap-2">
                        {item.type === 'memo' && !isDone && (
                            <p className="text-xs text-zinc-500 bg-zinc-50 p-1.5 rounded-md border border-zinc-100 line-clamp-2">{item.desc}</p>
                        )}
    
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            {item.isUrgent && <span className="text-[10px] px-1.5 py-0.5 bg-red-50 text-red-600 rounded">加急</span>}
                            {item.due && <span className="text-[10px] px-1.5 py-0.5 bg-orange-50 text-orange-600 rounded">截 {item.due}</span>}
                            {status === 'delegated' && item.person && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded flex items-center gap-1">
                                    <Icons.User /> {item.person}
                                </span>
                            )}
                            {item.timeBucket && <span className="text-[10px] px-1.5 py-0.5 bg-zinc-100 text-zinc-500 rounded">{item.timeBucket}</span>}
                            {item.area && <span className="text-[10px] px-1.5 py-0.5 text-zinc-400">{item.area}</span>}
                        </div>
​                    </div>

​                    {/* Action Bar (Hover revealed) */}
​                    {!isDone && (
                        <div className="h-0 overflow-hidden group-hover:h-auto group-hover:mt-3 transition-all opacity-0 group-hover:opacity-100 pl-6 flex flex-wrap gap-2">
                            {status === 'planned' && (
                                <button onClick={() => onTransition(item.id, 'doing')} className="text-[11px] font-medium text-yike bg-yike-light hover:bg-yike/20 px-2.5 py-1.5 rounded-lg transition-colors">
                                    马上做
                                </button>
                            )}
                            {item.type === 'memo' && status === 'planned' && (
                                <>
                                    <button onClick={() => onConvert(item.id)} className="text-[11px] font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Icons.Convert/> 转任务</button>
                                    <button onClick={() => onSplit(item.id)} className="text-[11px] font-medium text-zinc-600 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1.5 rounded-lg flex items-center gap-1"><Icons.Split/> 拆分</button>
                                </>
                            )}
                            {(status === 'doing' || status === 'delegated') && (
                                <button onClick={() => onTransition(item.id, 'done')} className="text-[11px] font-medium text-green-600 bg-green-50 hover:bg-green-100 border border-green-100 px-2.5 py-1.5 rounded-lg transition-colors">
                                    标记完成
                                </button>
                            )}
                            {status === 'delegated' && (
                                <button onClick={() => onTransition(item.id, 'doing')} className="text-[11px] font-medium text-zinc-500 bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1.5 rounded-lg">
                                    自己跟进
                                </button>
                            )}
                        </div>
​                    )}
​                    
​                    {/* Done Action Bar */}
​                    {isDone && (
                        <div className="h-0 overflow-hidden group-hover:h-auto group-hover:mt-2 transition-all opacity-0 group-hover:opacity-100 pl-6 flex gap-2">
                             <button onClick={() => onTransition(item.id, 'planned')} className="text-[10px] font-medium text-zinc-500 bg-zinc-100 hover:bg-zinc-200 px-2 py-1 rounded">撤回</button>
                        </div>
​                    )}
​                </motion.div>
​            );
​        };

​        const StatusLanes = ({ lanes, onTransition, onConvert, onSplit }) => {
​            const laneConfigs = [
​                { id: 'planned', title: '计划做' },
​                { id: 'doing', title: '正在做' },
​                { id: 'delegated', title: '别人做' },
​                { id: 'done', title: '做完了' }
​            ];

​            return (
​                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 xl:gap-6 pb-20">
​                    {laneConfigs.map(config => {
​                        const items = lanes[config.id] || [];

​                        return (
​                            <motion.div key={config.id} variants={fadeInY} className="flex flex-col">
​                                <div className="flex items-center gap-2 mb-4 px-1">
​                                    <h3 className="text-[13px] font-semibold text-zinc-700 tracking-wide">{config.title}</h3>
​                                    <span className="text-xs text-zinc-400 bg-zinc-200/50 px-1.5 py-0.5 rounded-md font-medium">{items.length}</span>
​                                </div>

                                <div className="flex flex-col gap-3 min-h-[150px]">
                                    <AnimatePresence mode="popLayout">
                                        {items.length === 0 && (
                                            // 仪器卡尺感 - 空状态
                                            <motion.div 
                                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                                className="h-[80px] rounded-xl empty-slot-dashed flex items-center justify-center text-zinc-400 bg-zinc-50/50"
                                            >
                                                <span className="text-[11px] font-medium tracking-widest uppercase">槽位空闲</span>
                                            </motion.div>
                                        )}

​                                        {items.map((item, index) => {
​                                            // Visual Hijack: First item in 'Doing' becomes the Primary Focus
​                                            if (config.id === 'doing' && index === 0) {
​                                                return <PrimaryFocusCard key={item.id} item={item} onTransition={onTransition} />;
​                                            }

​                                            // Sub-highlight for top 2 planned items
​                                            const displayItem = config.id === 'planned' && index < 2 ? {...item, isCandidate: true} : item;

​                                            return (
​                                                <StandardCard 
​                                                    key={item.id} 
​                                                    item={displayItem} 
​                                                    status={config.id} 
​                                                    onTransition={onTransition}
​                                                    onConvert={onConvert}
​                                                    onSplit={onSplit}
​                                                />
​                                            );
​                                        })}
​                                    </AnimatePresence>
​                                </div>
​                            </motion.div>
​                        );
​                    })}
​                </div>
​            );
​        };

​        const App = () => {
​            const [data, setData] = useState(MOCK_WORKBENCH);

​            // simulated API Calls
​            const handleAdd = (title) => {
​                const newItem = {
​                    id: 'new-' + Date.now(),
​                    title,
​                    type: 'task',
​                    timeBucket: '刚刚入库'
​                };
​                setData(prev => ({
​                    ...prev,
​                    lanes: {
​                        ...prev.lanes,
​                        planned: [newItem, ...prev.lanes.planned]
​                    }
​                }));
​            };

​            const handleTransition = (itemId, targetStatus) => {
​                setData(prev => {
​                    let foundItem = null;
​                    const newLanes = { ...prev.lanes };
​                    
​                    // Find and remove
​                    Object.keys(newLanes).forEach(key => {
​                        const idx = newLanes[key].findIndex(i => i.id === itemId);
​                        if (idx > -1) {
​                            foundItem = newLanes[key][idx];
​                            newLanes[key] = [...newLanes[key]];
​                            newLanes[key].splice(idx, 1);
​                        }
​                    });

​                    // Insert at top of target
​                    if (foundItem) {
​                        newLanes[targetStatus] = [foundItem, ...newLanes[targetStatus]];
​                    }

​                    return { ...prev, lanes: newLanes };
​                });
​            };

​            const handleConvert = (itemId) => {
​                // Mock Convert: Just change type and remove memo specific tags
​                setData(prev => {
​                    const planned = prev.lanes.planned.map(item => 
​                        item.id === itemId ? { ...item, type: 'task', title: `[已转任务] ${item.title}` } : item
​                    );
​                    return { ...prev, lanes: { ...prev.lanes, planned } };
​                });
​            };

​            return (
​                <div className="min-h-screen w-full flex justify-center py-8 px-4 sm:px-6 lg:px-8">
​                    <motion.div 
​                        className="max-w-[1200px] w-full"
​                        variants={staggerContainer}
​                        initial="hidden"
​                        animate="show"
​                    >
​                        {/* Header Area */}
​                        <motion.div variants={fadeInY} className="flex justify-between items-end mb-6">
​                            <div>
​                                <div className="flex items-center gap-2 mb-1.5">
​                                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight">一刻工作台</h1>
​                                    <Icons.Logo />
​                                </div>
​                                <p className="text-[13px] font-medium text-zinc-500">2026-06-14 星期日 · 新加坡</p>
​                            </div>
​                            <div className="flex gap-4 text-[13px] font-medium text-zinc-500">
​                                <button className="hover:text-zinc-800 transition-colors">管理领域</button>
​                                <button className="hover:text-zinc-800 transition-colors">项目面板</button>
​                            </div>
​                        </motion.div>

​                        {/* Top Action Area: Input + Radar */}
​                        <motion.div variants={fadeInY} className="mb-8">
​                            <QuickInput onAdd={handleAdd} />
​                            <RadarReminders reminders={data.reminders} />
​                        </motion.div>

​                        {/* Visual Divider indicating separation from setup to execution */}
​                        <motion.div variants={fadeInY} className="w-full h-px bg-gradient-to-r from-zinc-200 via-zinc-200 to-transparent mb-8"></motion.div>

​                        {/* 4 Pillars */}
​                        <StatusLanes 
​                            lanes={data.lanes} 
​                            onTransition={handleTransition}
​                            onConvert={handleConvert}
​                            onSplit={(id) => alert('调用拆分弹窗API: ' + id)}
​                        />
​                    </motion.div>
​                </div>
​            );
​        };

​        const root = ReactDOM.createRoot(document.getElementById('root'));
​        root.render(<App />);
​    </script>
</body>
</html>
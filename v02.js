/* FRAMEFLOW 0.2 extension: preserves V0.1 project JSON and localStorage data. */
(() => {
  const defaults = {trendTab:'real', duration:60, selectedProvider:'public_mirror',
    variants:{}, variantMeta:{}, analysis:{}, draftHistory:{}, status:'', lastFetch:null};
  state.v02 = Object.assign({}, defaults, state.v02 || {});
  const old = {
    renderOverview,renderTrends,renderLibrary,renderLab,renderScript,renderConnectors,
    renderIdeas,selectedIdeaPanel
  };
  let runtime = {health:null, busy:false, resultError:'', trendLoading:false};
  const JOB_KEY = KEY + '.generation';
  let pending = null, job = null, jobError = '', pollTimer = null, checking = false;
  pending = null;
  if (!pending || typeof pending.id !== 'string' || !pending.snapshot) pending = null;
  const baseRender = render;
  render = function(){baseRender();document.getElementById('root').insertAdjacentHTML('afterbegin',jobPanel())};
  const blocked = () => runtime.busy || Boolean(pending);
  const fmtTime = val => {
    if(!val) return '未知时间';
    const d=new Date(val); return isNaN(d.getTime())?'未知时间':d.toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  };
  const isReal = x => Boolean(x && (x.verifiedTrend||x.sourceType==='official_api'||x.sourceType==='public_mirror'));
  function sourceTrend(){const item=currentTrend(); return item?.demo?null:item||null;}
  function formatHot(n){
    if(n==null||n==='')return '无数据';
    const v=Number(n); if(!Number.isFinite(v))return String(n);
    return v>=1e8?(v/1e8).toFixed(2)+'亿':v>=1e4?(v/1e4).toFixed(1)+'万':v.toLocaleString('zh-CN');
  }
  const sleep = ms => new Promise(r=>setTimeout(r,ms));
  async function api(path,data,method='POST',timeout=55000){
    if(window.FRAMEFLOW_MODE==='pages')throw Error('在线演示版未启用服务端 API');
    const abort=new AbortController(); const timer=setTimeout(()=>abort.abort(),timeout);
    try{
      const options={method,signal:abort.signal,headers:{'Accept':'application/json'}};
      if(data!==undefined){options.headers['Content-Type']='application/json';options.body=JSON.stringify(data)}
      const res=await fetch(path,options);
      let result;try{result=await res.json()}catch{throw Error('服务没有返回有效 JSON，请使用 python3 server.py 启动 V0.3')}
      if(!res.ok){const e=Error(result.error||`HTTP ${res.status}`);e.status=res.status;throw e}
      return result;
    }catch(e){if(e.name==='AbortError')throw Error('请求超时，目标平台或模型可能暂时不可用');throw e}
    finally{clearTimeout(timer)}
  }
  function localCopyFallback(kind){
    const x=currentIdea(),t=currentTrend();
    if(kind==='variants')return constructVariants(x,t,state.collisionMode);
    return makeDraft(x,null,t);
  }
  function textBlock(text){return `<div class="v02-error">${h(text)}</div>`}
  function modelInfo(meta){
    if(!meta?.model)return '';
    const usage=meta.usage?.total_tokens;
    return `<p class="v02-caption">模型 ${h(meta.model)} · ${(Number(meta.latencyMs||0)/1000).toFixed(1)} 秒 · ${Number(meta.attempts)||1} 次请求 · ${usage==null?'用量未完整报告':h(usage)+' tokens'}</p>`;
  }
  function constraintInfo(checks){
    return Array.isArray(checks)&&checks.length?`<details class="v02-constraints"><summary>固定设定的剧情依据 · 请核对</summary>${checks.map(c=>`<p><b>${h(c.constraint)}</b><br>「${h(c.evidence)}」</p>`).join('')}<p class="small muted">引用来自生成时的版本，编辑后请重新核对。系统检查原文约束和引用片段；剧情是否满足设定仍需人工判断。</p></details>`:'';
  }
  function jobPanel(){
    if(!pending)return '';
    const status=job?.status||'unknown';
    const labels={queued:'排队中',running:'生成中',succeeded:'生成完成 · 待保存',failed:'生成未完成',unknown:'正在确认任务'};
    const attempt=job?.metadata?.attempts||1;
    let preview='';
    if(status==='succeeded'){
      const results=pending.kind==='variants'?job.result:[job.result];
      preview=results.map(r=>`<div class="v02-result"><h3>${h(r.title)}</h3><p>${h(r.logline||r.outline)}</p><p><b>开头：</b>${h(r.hook)}</p>${r.ending?`<p><b>结局：</b>${h(r.ending)}</p>`:''}${r.beats?.map(b=>`<p><b>${h(b.name)} · ${Number(b.duration)} 秒</b><br>${h(b.desc)}${b.dialogue?'<br>台词：'+h(b.dialogue):''}</p>`).join('')||''}${constraintInfo(r.constraintChecks)}</div>`).join('');
    }
    return `<section class="v02-panel" id="creative-job"><div class="panel-title"><h2>${h(pending.snapshot.title)} · ${pending.kind==='variants'?'三个原创方向':'AI 剧本'}</h2><span class="tag lime" role="status">${labels[status]||'任务状态未知'}</span></div><p class="small muted">${status==='running'||status==='queued'?`第 ${attempt} 次请求，刷新页面后可继续查看。`:'结果会保存到发起任务时的灵感。'}${status==='running'&&attempt>1?' 正在进行结构修复或等待网关恢复。':''}</p>${modelInfo(job?.metadata)}${job?.error?textBlock(job.error.message):''}${jobError?textBlock(jobError):''}<div class="row wrap">${status==='succeeded'?'<button class="btn primary" data-v02="apply-job">保存生成结果 →</button>':''}<button class="btn" data-v02="check-job" ${checking?'disabled':''}>检查任务状态</button>${status==='succeeded'||status==='failed'||jobError?'<button class="btn" data-v02="dismiss-job">关闭此任务</button>':''}</div>${preview}</section>`;
  }
  function rememberJob(value){
    // Store the known request ID before POST, so a lost response never prompts an automatic replay.
    if(value)localStorage.setItem(JOB_KEY,JSON.stringify(value));else localStorage.removeItem(JOB_KEY);
    pending=value;
  }
  function refreshJobPanel(){
    const panel=document.getElementById('creative-job');
    if(panel&&pending)panel.outerHTML=jobPanel();else render();
  }
  async function checkJob(){
    if(!pending||checking)return;
    const expectedId=pending.id;
    clearTimeout(pollTimer);checking=true;
    try{
      const out=await api('/api/creative/jobs/'+encodeURIComponent(pending.id),undefined,'GET',7000);
      if(pending?.id!==expectedId)return;
      job=out.job;jobError='';
      if(job.status==='queued'||job.status==='running')pollTimer=setTimeout(checkJob,3000);
    }catch(e){if(pending?.id===expectedId)jobError=e.status===404?'未查到该任务，请检查服务后再次确认；不会自动重发。':'暂时无法读取任务：'+e.message+'。恢复连接后点击检查任务状态。'}
    finally{checking=false;refreshJobPanel()}
  }
  async function startJob(kind,duration,direction=null){
    const idea=currentIdea(),context=gather(kind),requestId=crypto.randomUUID().replaceAll('-','');
    if(direction)context.trend=sourceTrend();
    const trend=context.trend;
    const entry={id:'generation_'+requestId,ideaId:idea.id,trendId:trend?.id||null,kind,
      snapshot:{title:idea.title,content:idea.content,mustKeep:idea.mustKeep||''},direction};
    job=null;jobError='';runtime.resultError='';
    try{
      rememberJob(entry);render();
      const out=await api('/api/creative/jobs',{...context,kind,provider:'llm',duration,requestId,direction},'POST',10000);
      rememberJob({...entry,id:out.job.id});job=out.job;
      if(job.status==='queued'||job.status==='running')pollTimer=setTimeout(checkJob,1000);
    }catch(e){
      if(e.status){rememberJob(null);runtime.resultError=e.message;toast(e.message)}
      else if(pending){jobError='任务提交结果尚未确认。请检查任务状态；不会自动重发。'}
      else{runtime.resultError='无法保存任务关联，请释放浏览器空间后重试。'}
    }finally{if(pending)refreshJobPanel();else render()}
  }
  async function confirmAction(message){
    const dialog=document.createElement('dialog');
    dialog.className='creative-confirm';
    dialog.innerHTML=`<h2>确认保存</h2><p>${h(message)}</p><div class="row wrap"><button class="btn" data-answer="no">取消</button><button class="btn primary" data-answer="yes">确认</button></div>`;
    document.body.appendChild(dialog);dialog.showModal();
    return new Promise(resolve=>{
      const finish=answer=>{dialog.close();dialog.remove();resolve(answer)};
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(false)},{once:true});
      dialog.querySelector('[data-answer="no"]').onclick=()=>finish(false);
      dialog.querySelector('[data-answer="yes"]').onclick=()=>finish(true);
    });
  }
  async function applyJob(){
    if(!pending||job?.status!=='succeeded')return;
    const idea=state.ideas.find(x=>x.id===pending.ideaId);
    if(!idea){jobError='原灵感已删除，生成结果仍保留在任务中。';render();return}
    if(idea.title!==pending.snapshot.title||idea.content!==pending.snapshot.content||(idea.mustKeep||'')!==pending.snapshot.mustKeep){
      jobError='原灵感在生成期间已修改。请核对上方结果与最新设定，恢复原输入后再保存。';render();return;
    }
    if(pending.kind==='variants'){
      const key=[idea.id,pending.trendId||'none'].join(':');
      state.v02.variants[key]=job.result;
      state.v02.variantMeta[key]={provider:'llm',modelCalled:true,createdAt:job.updatedAt,metadata:job.metadata};
      state.currentIdea=idea.id;state.currentTrend=pending.trendId;save();rememberJob(null);job=null;navigate('lab');toast('三个原创方向已保存');
    }else if(await applyDraft(job.result,'llm',idea.id,pending.trendId,job.metadata)){
      rememberJob(null);job=null;render();
    }
  }
  function actionSource(){
    return `<div class="v02-inline-toolbar"><button class="btn primary" data-v02="refresh-trends" ${runtime.busy?'disabled':''}>${runtime.trendLoading?'刷新中…':'↻ 采集抖音热榜'}</button><button class="btn" data-action="import-trends">导入热点 JSON</button><button class="btn" data-nav="connectors">采集设置 ↗</button></div>`;
  }

  renderOverview = function(){
    let v=old.renderOverview();
    v=v.replace(/<section class="hero">[\s\S]*?<\/section>/, "");
    v=v.replace(/<div class="label">热点线索<\/div><div class="metric-value">[^<]*/, `<div class="label">自有热榜线索</div><div class="metric-value">${state.externalTrends.filter(isReal).length}`);
    v=v.replace("含 6 条演示主题", "示例与自有数据练习");
    const real=state.externalTrends.filter(isReal);
    const status=runtime.health?.aiConfigured?'AI 编剧已接入':'AI 未启用 · 演示版';
    const ribbon=`<div class="v02-banner"><span class="v02-kicker">FRAMEFLOW · V0.4.1 / CONTENT INTELLIGENCE</span><h2>创作前，先找到值得讲的故事。</h2><p class="v02-caption">写下自己的灵感，或使用示例与自有素材。通过规则模板组织剧情，再编辑剧本、分镜与时间线。</p><div class="v02-status-row"><span class="v02-pill">原创灵感 ${state.ideas.length} 条</span><span class="v02-pill">已采集热点 ${real.length} 条</span><span class="v02-pill ${runtime.health?.aiConfigured?'':'warn'}">${status}</span></div><div class="row wrap"><button class="btn primary" data-nav="ideas">＋ 写下我的灵感</button><button class="btn" data-nav="trends">↗ 浏览主题示例</button></div></div>`;
    return ribbon+v;
  };

  renderTrends = function(){
    const tab=state.v02.trendTab||'real';
    const real=state.externalTrends.filter(isReal);
    const imported=state.externalTrends.filter(x=>!isReal(x));
    const choices={real,manual:imported,samples:demoTrends};
    const ts=choices[tab]||real;
    const mode = tab==='real'?'真实抖音热榜':tab==='manual'?'用户导入':'离线示例';
    const notice=tab==='real'?`榜单来自 ${real.some(x=>x.sourceType==='official_api')?'抖音官方 API / ':''}${real.some(x=>x.sourceType==='public_mirror')?'第三方公开榜单':''}。采集可能因权限、robots 或页面变动失败；失败不会自动混入演示数据。`:
      tab==='manual'?'这些是你导入的数据，未经独立核实，不代表当前真实热度。':'演示数据仅用于练习操作，标题与增速均不代表当前抖音趋势。';
    const cards = ts.map((t,i)=>{
      const source=isReal(t)?t.sourceLabel||'抖音话题':tab==='samples'?'模拟示例':t.platform||'用户导入';
      const rank=isReal(t)?`#${Number(t.rank)||i+1}`:`0${i+1}`;
      const delta=t.rank_delta===null||t.rank_delta===undefined?'未形成比较':t.rank_delta>0?`排名 ↑ ${t.rank_delta}`:t.rank_delta<0?`排名 ↓ ${Math.abs(t.rank_delta)}`:'排名不变';
      return `<article class="v02-trend-card ${tab==='samples'?'v02-muted-example':''}">
        <div class="v02-trend-top"><span class="v02-big-rank">${rank}</span><span class="tag ${isReal(t)?'lime':''}">${h(mode)}</span></div>
        <div class="v02-trend-title">${h(t.title)}</div>
        <div class="v02-trend-source">${h(source)}</div>
        <div class="v02-trend-metrics"><span>热度 ${isReal(t)?h(formatHot(t.heat_value)):h(t.heat||'未验证')}</span>${isReal(t)?`<span>${h(delta)}</span>`:''}</div>
        ${isReal(t)?`<div class="v02-trend-source">采样时间 ${h(fmtTime(t.fetched_at||t.collectedAt))}</div>`:''}
        <div class="v02-trend-actions"><button class="btn small" data-action="select-trend" data-id="${h(t.id)}">用于创意碰撞 →</button>${t.url?`<a class="small" href="${h(t.url)}" target="_blank" rel="noopener noreferrer">打开话题 ↗</a>`:''}</div>
      </article>`;
    }).join('');
    return `${pageHeader('抖音热点雷达','热榜是创意信号，不是复制素材的任务清单。真实数据与导入、演示数据严格区分。',actionSource())}
      <div class="v02-banner"><div class="row between wrap"><div><span class="v02-kicker">DOUYIN HOT RADAR</span><h2>先采集，再挑能讲故事的话题。</h2></div><span class="v02-pill ${real.length?'':'warn'}">${real.length?'已保存 '+real.length+' 条真实线索':'尚无真实采样'}</span></div><p class="v02-caption">在线演示版支持示例练习和自有热榜导入，未开启实时平台采集。</p></div>
      <div class="panel" style="margin-bottom:16px"><div class="row between wrap"><div class="v02-mode-switch"><button class="choice ${tab==='real'?'selected':''}" data-v02="trend-tab" data-value="real">真实热榜 ${real.length}</button><button class="choice ${tab==='manual'?'selected':''}" data-v02="trend-tab" data-value="manual">我的导入 ${imported.length}</button><button class="choice ${tab==='samples'?'selected':''}" data-v02="trend-tab" data-value="samples">示例 ${demoTrends.length}</button></div><span class="small muted">${ts.length} 条记录</span></div></div>
      <div class="model-note" style="margin-bottom:18px">${h(notice)}</div>
      ${runtime.resultError&&state.view==='trends'?textBlock(runtime.resultError):''}
      ${ts.length?`<div class="v02-grid3">${cards}</div>`:`<div class="panel empty"><div class="empty-icon">⌁</div><strong>${tab==='real'?'还没有采集到真实热点':'这个分类暂无数据'}</strong><p class="muted">${tab==='real'?'演示版不采集实时热榜。可以导入自有数据，或切换到示例练习。':'你也可以导入自有数据，或切换分类。'}</p></div>`}`;
  };

  renderLibrary = function(){
    const widget=`<div class="v02-panel"><div class="panel-title"><h2>快速放入自己的素材</h2><span class="tag lime">用户输入 · 第一优先级</span></div>
      <p class="small muted">可导入故事片段、评论摘录、金句、剧本和对参考视频的观察。系统保存原始文本，不自行改写。上传图片 / 视频文件请使用下方原有上传区。</p>
      <div class="grid grid2"><div class="field"><label>素材标题</label><input id="v02-material-title" class="input" placeholder="例如：评论区关于角色背锅的热评"></div><div class="field"><label>素材类型</label><select class="select" id="v02-material-type"><option value="text">灵感文本</option><option value="script">已有剧本</option><option value="comment">评论摘录</option><option value="note">观察笔记</option></select></div></div>
      <div class="field"><label>内容</label><textarea id="v02-material-text" class="textarea" rows="5" placeholder="直接粘贴内容，或者把你自己的故事想法写在这里……"></textarea></div>
      <div class="field"><label>为什么收藏它？（可选）</label><input class="input" id="v02-material-note" placeholder="想要保留的笑点、冲突、情绪或叙事方式"></div>
      <div class="row between wrap"><span class="small muted">正文自动保存在当前浏览器，可通过项目 JSON 导出备份。</span><button class="btn primary" data-v02="save-material">＋ 添加到素材库</button></div>
      </div>`;
    return old.renderLibrary().replace('</section><section class="panel">','</section><section class="panel">').replace('<div class="layout-72">',widget+'<div class="layout-72">');
  };

  selectedIdeaPanel = function(){
    const base=old.selectedIdeaPanel(); const idea=currentIdea();
    if(!idea)return base;
    const a=state.v02.analysis?.[idea.id];
    const result=a?`<div class="v02-result"><span class="v02-ai-tag">${a.method==='local_heuristic'?'本地规则分析':'分析结果'}</span>
      <p><b>冲突机制：</b>${h(a.conflict||'')}</p><p><b>标签：</b>${h((a.labels||[]).join(' / '))}</p>
      <p><b>建议：</b>${h((a.suggestions||[]).join('；'))}</p>${(a.risks||[]).length?`<p><b>注意：</b>${h(a.risks.join('；'))}</p>`:''}</div>`:'';
    return base+`<div class="v02-panel"><div class="row between wrap"><div><h2>创意初步诊断</h2><p class="v02-caption">保留原始想法，分析冲突、情绪和后续改写方向。</p></div><button class="btn" data-v02="analyze-idea">✦ 分析当前灵感</button></div>${result}</div>`;
  };

  renderLab = function(){
    const idea=currentIdea();if(!idea)return old.renderLab();
    const trend=currentTrend(), cacheKey = [idea.id,trend?.id||'none'].join(':');
    const variants=state.v02.variants?.[cacheKey]||[];
    const meta=state.v02.variantMeta?.[cacheKey];
    const vcard=variants.map((v,i)=>`<div class="v02-result"><span class="v02-ai-tag">OPTION ${String(i+1).padStart(2,'0')}</span><h3>${h(v.title)}</h3>
      <p><b>开头：</b>${h(v.hook)}</p><p><b>剧情：</b>${h(v.outline)}</p><p><b>结局：</b>${h(v.ending)}</p>${constraintInfo(v.constraintChecks)}
      <button class="btn primary small" data-v02="adopt-ai-variant" data-index="${i}" ${blocked()?'disabled':''}>${meta?.provider==='llm'?'AI 扩写这个方向 →':'用这个方向填写空白模板 →'}</button></div>`).join('');
    const top=`<div class="v02-panel"><div class="panel-title"><h2>AI 创意策划</h2><span class="tag">${h(meta?.provider==='llm'?'模型真实生成':meta?.provider==='local'?'本地规则草案':'等待生成')}</span></div>
      <p class="small muted">系统将你选中的灵感、热点以及最近的参考素材放到同一份上下文中。用户“必须保留”的设定作为硬约束传给编剧。</p>
      <div class="row wrap"><button class="btn primary" data-v02="generate-variants" data-provider="llm" ${blocked()?'disabled':''}>✦ 使用 AI 生成三个原创方向</button><button class="btn" data-v02="generate-variants" data-provider="local" ${blocked()?'disabled':''}>查看规则思路（非 AI）</button><label>扩写时长（秒） <input id="v02-script-duration" class="input" style="width:90px" type="number" min="20" max="180" value="${Number(state.v02.duration)||60}"></label></div>${modelInfo(meta?.metadata)}
      ${runtime.resultError&&state.view==='lab'?textBlock(runtime.resultError):''}
      ${variants.length?`<div class="spacer"></div>${vcard}`:`<p class="v02-caption" style="margin-top:14px">AI 会写出三种具体剧情；规则思路只有固定句式，需要自行创作。也可直接去剧本工坊扩写，不必先碰撞。</p>`}
    </div>`;
    return `${pageHeader('创意碰撞','可选步骤：先探索三个故事方向，再把选中的方向扩写成剧本。')}
      <div class="panel" style="margin-bottom:18px"><div class="grid grid2"><div class="field"><label>原创灵感</label><select class="select" id="lab-idea">${ideaOptions(state.currentIdea)}</select></div><div class="field"><label>热点（可选）</label><select class="select" id="lab-trend">${trendOptions(state.currentTrend)}</select></div></div><p>${h(idea.content)}</p><p class="small muted">必须保留：${h(idea.mustKeep||'未指定')}</p></div>${top}`;
  };

  renderScript = function(){
    const idea=currentIdea(),d=currentDraft();
    const source=d?.origin==='llm'?'真实 AI 生成':d?.origin==='written_example'?'人工编写完整示例':d?.origin==='local_outline'?'空白模板 · 需自行填写':d?'模板 / 手动编辑':'待生成';
    const form=`<div class="v02-panel"><div class="panel-title"><h2>结构化 AI 编剧</h2><span class="tag ${d?.origin==='llm'?'lime':''}">${source}</span></div>
      <div class="row between wrap"><p class="small muted">从当前原创灵感、选中热点及素材中生成详细剧情节点，逐节点可编辑并进入分镜。</p></div>
      <div class="row wrap" style="align-items:end"><div class="field" style="min-width:155px;margin-bottom:0"><label>目标时长（秒）</label><input id="v02-script-duration" class="input" type="number" min="20" max="180" value="${Number(state.v02.duration)||60}"></div>
      <button class="btn primary" data-v02="generate-script" data-provider="llm" ${blocked()?'disabled':''}>✦ AI 扩写完整剧本</button><button class="btn" data-v02="generate-script" data-provider="local" ${blocked()?'disabled':''}>填写空白模板（非 AI）</button></div>
      <p class="small muted">AI 扩写：具体情节、角色台词与分镜动作。空白模板：只提供栏目和时间分配，需要自行写剧情与台词。</p>
      <label class="small"><input id="v02-use-trend" type="checkbox" ${state.v02.useTrend?'checked':''}> 加入已选热点（可选）：${h(sourceTrend()?.title||'未选真实热点')}</label>
      <div class="spacer"></div><p class="v02-caption">AI 结果先预览，保存后才替换当前剧本并保留旧版本。无需先做创意碰撞。未配置模型时会显示实际错误。</p>
      ${runtime.resultError&&state.view==='script'?textBlock(runtime.resultError):''}
      ${d?.origin?`<div class="v02-script-status"><div><b>当前剧本：</b>${h(d.title)}<span class="muted"> · ${d.beats.length} 个节点 · ${d.beats.reduce((n,b)=>n+Number(b.duration||0),0)} 秒</span></div><span class="tag lime">${source}</span></div>`:''}
      ${modelInfo(d?.generationMetadata)}${constraintInfo(d?.constraintChecks)}
      ${state.v02.draftHistory?.[idea?.id]?.length?`<p class="v02-caption">当前灵感的历史草案：${state.v02.draftHistory[idea.id].length} 份，导出项目 JSON 时一并保留。</p>`:''}
      </div>`;
    const base=old.renderScript();
    const loc=base.indexOf('</div>');
    // Insert after page header rather than altering the existing screenplay editor.
    const match=base.match(/^<div class="page-head">[\s\S]*?<\/div><\/div>/);
    return match?base.replace(match[0],match[0]+form):form+base;
  };

  renderConnectors = function(){
    const health=runtime.health;
    const status=health?`<div class="v02-status-row"><span class="v02-pill">本地服务已连接</span><span class="v02-pill ${health.aiConfigured?'':'warn'}">AI ${health.aiConfigured?'已配置 · '+h(health.llmModel):'待配置'}</span><span class="v02-pill ${health.officialDouyinConfigured?'':'warn'}">官方热点 ${health.officialDouyinConfigured?'Token 已配置':'Token 待配置'}</span><span class="v02-pill">热榜快照 ${health.snapshots||0}</span></div>`:
      '<div class="v02-error">无法连接本地服务。请在项目目录运行 python3 server.py，再访问 http://127.0.0.1:8765。</div>';
    const top=`<div class="v02-banner"><span class="v02-kicker">DATA SOURCES / LOCAL WORKER</span><h2>采集接口与模型连接</h2><p class="v02-caption">本机服务不需要平台账户密码。公开页面采集和官方热点 API 分别运行，失败会呈现真实错误，不会用示例热点伪装成功。</p>${status}</div>
      <div class="v02-settings"><div class="panel"><div class="panel-title"><h2>抖音热点数据源</h2><span class="tag lime">已实现后端适配器</span></div>
        <div class="field"><label>采集方式</label><select id="v02-source" class="select"><option value="public_mirror" ${state.v02.selectedProvider==='public_mirror'?'selected':''}>第三方公开热榜页面采集（默认，可能受限）</option><option value="douyin_official" ${state.v02.selectedProvider==='douyin_official'?'selected':''}>抖音官方 Hotsearch API（需权限和 Token）</option></select></div>
        <p class="small muted">公开榜单来自第三方页面，不等于平台官方授权 API；两者均保存来源与采样时间。热度是快照值，排名变化只有第二次采集后才能比较。</p>
        <button class="btn primary" data-v02="refresh-trends">立即采集真实热榜 →</button>
        ${runtime.resultError&&state.view==='connectors'?textBlock(runtime.resultError):''}
      </div><div class="panel"><h2>AI 编剧接入</h2><p class="small muted">支持 OpenAI 兼容的 Chat Completions JSON 接口。API Key 只读取本地服务端环境变量，不放在浏览器页面里。</p><div class="v02-mini-card"><strong>环境变量</strong><p><code>FRAMEFLOW_LLM_API_KEY</code><br><code>FRAMEFLOW_LLM_BASE_URL</code><br><code>FRAMEFLOW_LLM_MODEL</code><br><code>DOUYIN_CLIENT_TOKEN</code></p></div><div class="spacer"></div><button class="btn" data-v02="refresh-health">检查连接状态 ↻</button></div></div>`;
    return top+old.renderConnectors();
  };

  function gather(kind='variants'){
    const idea=currentIdea(),trend=kind==='script'&&!state.v02.useTrend?null:sourceTrend();
    return {idea:{title:idea?.title,content:idea?.content,mustKeep:idea?.mustKeep,tags:idea?.tags},
            trend:trend?{...trend}:null,
            materials:state.sources.slice(-7).filter(x=>x.body||x.note).map(x=>({title:x.title,content:x.body||'',note:x.note||'',url:x.url||''}))};
  }
  async function refreshHealth(){
    try{runtime.health=await api('/api/health',undefined,'GET',4000);const el=document.getElementById('api-status');if(el){el.textContent=runtime.health.aiConfigured?'V'+runtime.health.version+' 在线 · AI 已接入':'V'+runtime.health.version+' 在线 · AI 待配置';document.getElementById('api-dot')?.classList.add('green')}}
    catch{runtime.health=null}
    render();
  }
  async function loadTrends(){
    try{const res=await api('/api/trends',undefined,'GET',5000);importFetched(res.items||[],false)}catch{}
  }
  function importFetched(items,navigateTo){
    const clean=items.filter(t=>t&&t.title&&isReal(t));
    if(!clean.length&&!navigateTo)return;
    const existing=state.externalTrends.filter(x=>!isReal(x));
    const next=[...clean,...existing];
    if(JSON.stringify(next)===JSON.stringify(state.externalTrends)&&!navigateTo)return;
    state.externalTrends=next;
    if(clean.length){state.currentTrend=clean[0].id;state.v02.lastFetch=Date.now()}
    save();if(navigateTo){state.v02.trendTab='real';navigate('trends')}else if(state.view==='trends'||state.view==='overview')render();
  }
  async function refreshTrends(){
    if(runtime.busy)return;
    runtime.busy=true;runtime.trendLoading=true;runtime.resultError='';render();
    try{
      const res=await api('/api/trends/refresh',{source:state.v02.selectedProvider},'POST',24000);
      importFetched(res.items||[],true);
      toast(`真实采集完成：新增 ${res.collectedCount} 条，本次采样已保存`);
    }catch(e){runtime.resultError='采集未完成：'+e.message;toast('采集失败：详情见页面，未写入示例数据')}
    finally{runtime.busy=false;runtime.trendLoading=false;render()}
  }
  async function saveMaterial(){
    const text=getForm('v02-material-text'),title=getForm('v02-material-title')||short(text,20),note=getForm('v02-material-note');
    const kind=getForm('v02-material-type')||'text';
    if(!text){toast('请输入素材正文');return}
    let serverStored=false;
    try{await api('/api/materials/import',{type:kind,content:text,title,note});serverStored=true}
    catch{}
    state.sources.push({id:uid('src'),type:'text',title,name:title,body:text,note,
         extracted:true,createdAt:Date.now(),storage:serverStored?'local_sqlite+browser':'browser_only'});
    save();render();toast(serverStored?'素材已写入 SQLite，并保存到浏览器':'素材已保存在当前浏览器');
  }
  async function analyzeIdea(){
    const x=currentIdea();if(!x)return;
    try{
      const out=await api('/api/creative/analyze',gather());
      state.v02.analysis[x.id]=out.analysis;save();render();toast('创意诊断完成（本地规则分析）')
    }catch(e){toast('分析服务不可用：'+e.message)}
  }
  async function generateVariants(provider){
    if(blocked())return;const idea=currentIdea();if(!idea){toast('请先创建灵感');return}
    if(provider==='llm'){await startJob('variants',Number(state.v02.duration)||60);return}
    const trendId=currentTrend()?.id||null;
    runtime.busy=true;runtime.resultError='';render();
    try{
      const out=await api('/api/creative/generate',{...gather(),kind:'variants',provider,duration:state.v02.duration});
      const key=[idea.id,trendId||'none'].join(':');
      state.v02.variants[key]=out.result;
      state.v02.variantMeta[key]={provider:out.provider,createdAt:out.createdAt,modelCalled:out.modelCalled};
      save();render();toast(out.modelCalled?'AI 已生成原创创意候选':'已生成本地结构化创意草案');
    }catch(e){
      if(provider==='local'){
        const key=[idea.id,trendId||'none'].join(':');
        state.v02.variants[key]=constructVariants(idea,null,state.collisionMode);
        state.v02.variantMeta[key]={provider:'local',modelCalled:false};save();render();toast('已使用浏览器规则模板（非 AI 生成）')
      }else{runtime.resultError=e.message;render();toast('AI 生成失败，未用模板冒充模型输出')}
    }finally{runtime.busy=false;render()}
  }
  async function applyDraft(d,provider,ideaId=currentIdea()?.id,trendId=sourceTrend()?.id||null,metadata=null){
    const x=state.ideas.find(x=>x.id===ideaId);if(!x)return false;
    const before=state.drafts[x.id];
    if(before){
      const answer=await confirmAction(`已有「${before.title}」剧本。将保存历史版本，再覆盖当前剧本${state.shots.length?'并清空旧分镜':''}。`);
      if(!answer)return false;
      state.v02.draftHistory[x.id]=state.v02.draftHistory[x.id]||[];
      state.v02.draftHistory[x.id].push({savedAt:Date.now(),draft:JSON.parse(JSON.stringify(before))});
      state.v02.draftHistory[x.id]=state.v02.draftHistory[x.id].slice(-12);
    }
    const beats=(d.beats||[]).map((b,i)=>({...b,id:b.id||uid('beat'),duration:Math.max(1,Number(b.duration)||5)}));
    state.drafts[x.id]={title:d.title||x.title,logline:d.logline||x.content,hook:d.hook||'',
      keep:d.keep??x.mustKeep??'',beats,createdAt:Date.now(),origin:provider,linkedTrend:trendId,
      generationMetadata:metadata,constraintChecks:d.constraintChecks||[]};
    window.frameflowArchiveShots?.();
    state.project={title:d.title||x.title,ideaId:x.id,sourceTrendId:trendId};
    state.currentIdea=x.id;
    state.shots=[];state.selectedShot=null;
    save();navigate('script');toast(provider==='llm'?'模型生成的剧本已保存，可继续修改分镜':'本地结构草案已创建，可直接编辑');
    return true;
  }
  async function generateScript(provider){
    if(blocked())return;const x=currentIdea();if(!x){toast('先添加一条灵感');return}
    const el=document.getElementById('v02-script-duration');
    const sec=Number(el?.value||state.v02.duration||60);
    if(!Number.isInteger(sec)||sec<20||sec>180){toast('目标时长需为 20–180 秒整数');return}
    state.v02.duration=sec;save();
    if(provider==='llm'){await startJob('script',sec);return}
    if(window.frameflowEmptyDraft){await applyDraft(window.frameflowEmptyDraft(x,sec),'local_outline',x.id,sourceTrend()?.id||null);return}
    const trendId=sourceTrend()?.id||null;
    runtime.busy=true;runtime.resultError='';render();
    try{
      const out=await api('/api/creative/generate',{...gather(),kind:'script',provider,duration:sec});
      await applyDraft(out.result, out.modelCalled?'llm':'local_outline',x.id,trendId);
    }catch(e){
      if(provider==='local'){
        const d=window.frameflowPagesDraft(x,sec);await applyDraft(d,'local_outline',x.id,trendId);toast('已使用浏览器规则模板（非 AI 生成）')
      }else {runtime.resultError=e.message;render();toast('AI 生成失败，请检查配置')}
    }finally{runtime.busy=false;render()}
  }
  async function adoptVariant(i){
    if(blocked())return;
    const x=currentIdea(),trend=currentTrend(),key=[x?.id,trend?.id||'none'].join(':');
    const v=state.v02.variants?.[key]?.[i];if(!v)return;
    const seconds=Number(document.getElementById('v02-script-duration')?.value||state.v02.duration||60);
    if(!Number.isInteger(seconds)||seconds<20||seconds>180){toast('目标时长需为 20–180 秒整数');return}
    state.v02.duration=seconds;save();
    if(state.v02.variantMeta?.[key]?.provider==='llm'){
      navigate('script');await startJob('script',seconds,v);return;
    }
    const d=window.frameflowEmptyDraft?window.frameflowEmptyDraft(x,seconds,v):makeDraft(x,v,trend);
    await applyDraft(d,'local_outline');
  }

  // Capture our new actions before the legacy handler, leaving old project interactions intact.
  document.addEventListener('click',async event=>{
    if(event.target.closest('[data-action="to-shots"]')){
      event.preventDefault();event.stopImmediatePropagation();
      const draft=currentDraft();if(!draft){toast('请先 AI 扩写剧本、载入完整示例，或填写空白模板。');return}
      if(state.shots.length&&!await confirmAction('重新拆镜会替换当前分镜。建议先导出项目。'))return;
      window.frameflowArchiveShots?.();
      state.shots=draft.beats.flatMap((beat,i)=>{
        const splits=Array.isArray(beat.shots)&&beat.shots.length?beat.shots.length:1;
        return Array.from({length:splits},(_,part)=>shotFromBeat(beat,i,draft.keep,part,splits));
      });
      state.project={title:draft.title,ideaId:state.currentIdea,sourceTrendId:draft.linkedTrend||null};
      state.selectedShot=state.shots[0]?.id||null;save();navigate('shots');toast(`已生成 ${state.shots.length} 个可编辑镜头`);return;
    }
    const target=event.target.closest('[data-v02]');if(!target)return;
    event.preventDefault();event.stopImmediatePropagation();
    const action=target.dataset.v02;
    if(action==='trend-tab'){state.v02.trendTab=target.dataset.value;save();render()}
    else if(action==='refresh-trends'){await refreshTrends()}
    else if(action==='refresh-health'){await refreshHealth()}
    else if(action==='save-material'){await saveMaterial()}
    else if(action==='analyze-idea'){await analyzeIdea()}
    else if(action==='generate-variants'){await generateVariants(target.dataset.provider||'llm')}
    else if(action==='generate-script'){await generateScript(target.dataset.provider||'llm')}
    else if(action==='adopt-ai-variant'){await adoptVariant(Number(target.dataset.index))}
    else if(action==='check-job'){await checkJob()}
    else if(action==='apply-job'){await applyJob()}
    else if(action==='dismiss-job'){
      if(job?.status==='failed'||await confirmAction('关闭任务关联后，本页不再跟踪结果。正在运行的模型请求仍会完成。')){
        clearTimeout(pollTimer);rememberJob(null);job=null;jobError='';render();
      }
    }
  },true);
  document.addEventListener('change',event=>{
    const target=event.target;
    if(target?.id==='v02-source'){state.v02.selectedProvider=target.value;save()}
    if(target?.id==='v02-script-duration'){state.v02.duration=Number(target.value)||60;save()}
    if(target?.id==='v02-use-trend'){state.v02.useTrend=target.checked;save()}
  },true);

  // Restore the currently open view and asynchronously rehydrate DB-backed trends.
  render();
  
})();

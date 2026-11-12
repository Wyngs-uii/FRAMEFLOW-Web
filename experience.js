/* Honest capabilities, the shortest writing path, and recoverable deletions. */
(() => {
  const pages = window.FRAMEFLOW_MODE === 'pages';
  NAV.find(x => x[0] === 'timeline')[1] = '分镜时间线';
  const base = {render, renderOverview, renderIdeas, renderScript, renderShots, renderTimeline, openModal, toast};
  const notifyKey = KEY + '.last-message';
  let message = '';
  try { message = localStorage.getItem(notifyKey) || ''; } catch {}

  function feedback() {
    let bar = document.getElementById('persistent-feedback');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'persistent-feedback'; bar.className = 'experience-feedback';
      document.querySelector('.main').appendChild(bar);
    }
    const deleted = state.v02?.deleted || [];
    bar.innerHTML = `<span role="status">${h(message || '编辑自动保存。AI 结果需要预览并确认保存。')}</span>
      ${deleted.length ? `<button class="btn small" data-experience="undo">恢复最近删除（${deleted.length}）</button>` : ''}`;
  }
  toast = function(text) {
    message = String(text); try { localStorage.setItem(notifyKey, message); } catch {}
    base.toast(text); feedback();
  };
  function guide() {
    return `<section class="panel experience-guide"><div class="panel-title"><h2>从一句话到分镜，最短四步</h2><span class="tag">热点与创意碰撞可选</span></div>
      <div class="experience-steps">${[
        ['ideas','1 · 写灵感','保存原话与必须保留的设定'],
        ['script','2 · 写剧本',pages?'加载完整示例，或填空白模板':'选择时长，AI 写具体情节和台词'],
        ['shots','3 · 审核分镜','确认剧本，再生成可编辑镜头'],
        ['timeline','4 · 检查节奏','检查顺序、总时长并导出清单']
      ].map(([view,title,desc]) => `<button class="experience-step ${state.view===view?'selected':''}" data-nav="${view}"><b>${title}</b><span>${desc}</span></button>`).join('')}</div>
      <p class="hint">${pages?'演示版不会自动扩写剧情。完整示例是人工写好的作品；空白模板需要自行补全。':'AI 通过本机后端调用，Key 不进入网页。生成结果先预览，保存后再拆分镜。'}时间线展示制作计划，不能播放或导出视频。</p></section>`;
  }
  function examples() {
    return `<section class="panel experience-examples"><div class="panel-title"><h2>先看看完整剧本长什么样</h2><span class="tag">人工编写示例 · 非 AI 生成</span></div>
      <div class="grid grid2">${window.FRAMEFLOW_EXAMPLES.map((example,index) => `<article class="item-card"><h3>${h(example.title)}</h3><p class="small muted">${h(example.logline)}</p><p class="small">${example.beats.length} 个具体节点 · 60 秒 · 完整台词与分镜计划</p><button class="btn" data-experience="example" data-index="${index}">添加示例并阅读剧本 →</button></article>`).join('')}</div>
      <p class="hint">示例会添加为独立灵感，保留现有剧本和分镜。你可以修改后再用 AI 重新扩写。</p></section>`;
  }
  window.frameflowEmptyDraft = (idea,seconds,direction=null) => {
    const weights = [5,12,16,15,7],total = weights.reduce((a,b)=>a+b,0);
    const times = weights.map(n=>Math.max(1,Math.floor(n*seconds/total)));
    for(let i=0,left=seconds-times.reduce((a,b)=>a+b,0);left>0;i++,left--)times[i%times.length]++;
    return {title:idea.title,logline:direction?.outline||idea.content,hook:direction?.hook||'',keep:idea.mustKeep||'',origin:'local_outline',
      beats:['开头','人物目标','具体冲突','转折','结局'].map((name,i)=>({id:uid('beat'),name,duration:times[i],desc:'',dialogue:''}))};
  };
  makeDraft = (idea,variant=null) => window.frameflowEmptyDraft(idea,Number(state.v02.duration)||60,variant);
  renderOverview = () => guide() + base.renderOverview() + examples();
  renderIdeas = () => guide() + base.renderIdeas();
  renderScript = () => guide() + base.renderScript();
  window.frameflowArchiveShots = () => {
    if(!state.shots.length||!state.project?.ideaId)return;
    state.v02.storyboards=state.v02.storyboards||{};
    state.v02.storyboards[state.project.ideaId]={shots:JSON.parse(JSON.stringify(state.shots)),project:{...state.project},selectedShot:state.selectedShot};
  };
  renderShots = () => {
    if(state.currentIdea&&state.project?.ideaId!==state.currentIdea) {
      const archived=state.v02.storyboards?.[state.currentIdea];
      return `${pageHeader('分镜工作台','当前灵感：'+(currentIdea()?.title||''))}<section class="panel"><h2>切换故事后，原项目分镜仍保留</h2><p class="small muted">可以从当前剧本生成分镜，或恢复它此前保存的分镜计划。</p><div class="row wrap"><button class="btn primary" data-action="to-shots">从当前剧本生成分镜 →</button>${archived?'<button class="btn" data-experience="restore-shots">恢复此剧本的已保存分镜</button>':''}</div></section>`;
    }
    return base.renderShots();
  };
  renderTimeline = () => base.renderTimeline().replace('成片时间线','分镜时间线')
    .replace('预计成片长度','计划总时长')
    .replace('在这里审查镜头顺序与节奏。V0.1 可导出镜头清单，完整剪辑渲染将在下一阶段实现。','检查分镜顺序与计划时长，导出 Markdown 或 JSON 制作清单。当前无法播放视频或渲染 MP4。');

  render = function() {
    base.render();
    for (const button of document.querySelectorAll('[data-action="generate-script"]')) {
      button.dataset.action = state.view==='script'?(pages?'empty-template':'ai-direct'):'prepare-script';
      button.textContent = state.view==='script'?(pages?'填写空白模板（非 AI）':'✦ 用 AI 扩写当前灵感'):(pages?'进入剧本编辑 →':'进入 AI 剧本工坊 →');
      if(state.view==='script')button.disabled=Boolean(document.getElementById('creative-job'));
    }
    for (const button of document.querySelectorAll('[data-action="regenerate-script"]')) {
      button.dataset.action = 'empty-template';button.textContent = '重建空白模板（非 AI）';
    }
    for (const button of document.querySelectorAll('[data-action="adopt-variant"]')) {
      button.dataset.action = 'empty-template';button.textContent = '填写空白模板（非 AI）';
    }
    for (const note of document.querySelectorAll('.model-note')) {
      if (note.textContent.includes('离线演示会基于')) note.textContent = 'AI 剧本包含实际情节、台词和分镜动作。空白模板只有栏目，需要自行创作。修改节点剧情、台词或时长后，更新分镜会使用编辑后的内容。';
    }
    if (pages) {
      const root = document.getElementById('root');
      root.innerHTML = root.innerHTML.replace('AI 扩写不会覆盖你的设定','原始内容完整保留；演示版需要自己写剧情')
        .replace('先原样保存，再逐步扩写。','先保存原话，再自己写剧情或阅读完整示例。');
    }
    feedback();
  };
  openModal = function(type) {
    base.openModal(type);
    if (type === 'import-trends') {
      const field = document.getElementById('trend-json');
      field.insertAdjacentHTML('beforebegin', '<p class="small">每次 1–100 条，仅 title 必填。以下是可直接修改的范例；导入数据标为“用户导入”。</p>');
      field.value = JSON.stringify([{title:'朋友互相甩锅',platform:'我的采集结果',category:'喜剧',tags:['反转'],why:'责任分配引发冲突',formula:'真相揭晓后发生二次反转',url:'https://example.com/'}],null,2);
      field.insertAdjacentHTML('afterend','<button class="btn small" data-experience="trend-template">下载热点 JSON 模板</button>');
    }
  };
  const cancel = event => { event.preventDefault();event.stopImmediatePropagation(); };
  function rememberDeletion(record) {
    state.v02.deleted = [...(state.v02.deleted||[]),record].slice(-10);save();render();toast('已删除，可点击“恢复最近删除”撤销。');
  }
  function undo() {
    const record = state.v02.deleted?.at(-1);if(!record)return;
    if(record.kind==='idea') {
      if(state.ideas.some(x=>x.id===record.item.id))return toast('此灵感已存在，请先处理重复记录。');
      state.ideas.splice(record.index,0,record.item);
      if(record.draft)state.drafts[record.item.id]=record.draft;
      state.currentIdea=record.item.id;
      if(record.project && !state.project?.ideaId && !state.shots.length) {
        state.project=record.project;state.shots=record.shots;state.selectedShot=record.selectedShot;
      }
    } else if(record.kind==='beat') {
      const draft=state.drafts[record.ideaId];
      if(!draft)return toast('请先恢复所属灵感，再恢复节点。');
      if(draft.beats.some(x=>x.id===record.item.id))return toast('此节点已存在。');
      draft.beats.splice(record.index,0,record.item);state.currentIdea=record.ideaId;
    } else {
      const list=record.kind==='shot'?state.shots:state.sources;
      if(record.kind==='shot'&&state.project?.ideaId!==record.ideaId)return toast('请先切回原剧本，避免把镜头放到其他项目。');
      if(list.some(x=>x.id===record.item.id))return toast('此记录已存在。');
      list.splice(record.index,0,record.item);
      if(record.kind==='shot')state.selectedShot=record.item.id;
    }
    state.v02.deleted.pop();save();render();toast('已恢复最近删除的记录，其他编辑保留。');
  }
  document.addEventListener('click',event => {
    const target=event.target.closest('[data-experience], [data-action]');if(!target)return;
    const action=target.dataset.experience||target.dataset.action;
    if(action==='prepare-script'){cancel(event);navigate('script');return;}
    if(action==='ai-direct') {
      cancel(event);document.querySelector('[data-v02="generate-script"][data-provider="llm"]')?.click();return;
    }
    if(action==='empty-template') {
      cancel(event);const trigger=document.querySelector('[data-v02="generate-script"][data-provider="local"]');
      if(trigger)trigger.click();else navigate('script');return;
    }
    if(action==='trend-template') {
      cancel(event);download('frameflow_hotspots_template.json',document.getElementById('trend-json').value);return;
    }
    if(action==='undo'){cancel(event);undo();return;}
    if(action==='restore-shots') {
      cancel(event);const archive=state.v02.storyboards?.[state.currentIdea];if(!archive)return;
      window.frameflowArchiveShots();state.shots=JSON.parse(JSON.stringify(archive.shots));state.project={...archive.project};state.selectedShot=archive.selectedShot;
      save();render();toast('已恢复此剧本的分镜，另一份分镜已保存。');return;
    }
    if(action==='example') {
      cancel(event);const example=window.FRAMEFLOW_EXAMPLES[Number(target.dataset.index)];if(!example)return;
      const idea={id:uid('idea'),title:example.title,content:example.content,mustKeep:example.mustKeep,tags:['完整示例'],source:'written_example',createdAt:Date.now()};
      const beats=example.beats.map(([name,duration,desc,dialogue,size,move])=>({id:uid('beat'),name,duration,desc,dialogue,
        shots:[{title:name,duration,description:desc,dialogue,size,move}]}));
      state.ideas.push(idea);state.drafts[idea.id]={title:idea.title,logline:example.logline,hook:example.hook,keep:idea.mustKeep,
        beats,origin:'written_example',createdAt:Date.now()};
      state.currentIdea=idea.id;save();navigate('script');toast('已添加人工编写的完整示例。现有作品和分镜保留。');return;
    }
    if(!['delete-idea','delete-beat','remove-shot','delete-source'].includes(action))return;
    cancel(event);
    let record;
    if(action==='delete-idea') {
      const item=currentIdea();if(!item)return;
      if(!confirm('删除「'+item.title+'」？删除后可恢复。'))return;
      record={kind:'idea',item,index:state.ideas.indexOf(item),draft:state.drafts[item.id]};
      if(state.project?.ideaId===item.id){record.project=state.project;record.shots=state.shots;record.selectedShot=state.selectedShot;state.project={title:'',ideaId:null,sourceTrendId:null};state.shots=[];state.selectedShot=null;}
      state.ideas=state.ideas.filter(x=>x.id!==item.id);delete state.drafts[item.id];state.currentIdea=state.ideas[0]?.id||null;
    } else if(action==='delete-beat') {
      const draft=currentDraft();if(!draft||draft.beats.length<=1)return toast('剧本至少保留一个节点。');
      const index=draft.beats.findIndex(x=>x.id===target.dataset.id);if(index<0)return;
      record={kind:'beat',ideaId:state.currentIdea,item:draft.beats[index],index};draft.beats.splice(index,1);
    } else {
      const list=action==='remove-shot'?state.shots:state.sources;
      const index=list.findIndex(x=>x.id===(action==='remove-shot'?state.selectedShot:target.dataset.id));if(index<0)return;
      record={kind:action==='remove-shot'?'shot':'source',ideaId:state.project?.ideaId,item:list[index],index};list.splice(index,1);
      if(action==='remove-shot')state.selectedShot=list[Math.min(index,list.length-1)]?.id||null;
    }
    rememberDeletion(JSON.parse(JSON.stringify(record)));
  },true);
  render();
})();

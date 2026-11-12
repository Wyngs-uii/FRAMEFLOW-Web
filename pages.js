/* Public Pages demo: browser storage, editable creative tools, no server credentials. */
(() => {
  const baseRender = render, baseSave = save;
  let saved = true;
  NAV.find(item => item[0] === 'connectors')[1] = '使用说明';
  if (!state.externalTrends.length) state.v02.trendTab = 'samples';
  const unavailable = '在线演示版未启用 AI 与实时采集，可使用浏览器规则模板和自有素材。';
  const disabledSelector = '[data-provider="llm"], [data-v02="refresh-trends"], [data-v02="analyze-idea"], [data-action="fetch-url"], [data-action="batch-crawl"]';

  function decorate() {
    const status = document.getElementById('api-status');
    if (status) status.textContent = '在线演示版';
    document.getElementById('api-dot')?.classList.add('green');
    const sync = document.getElementById('project-sync');
    if (sync) {
      sync.textContent = saved ? '浏览器已保存' : '保存失败 · 请导出';
      sync.title = '数据只保存在当前浏览器，请通过导出项目备份';
    }
    const root = document.getElementById('root');
    root.insertAdjacentHTML('afterbegin', '<div class="panel" style="margin-bottom:18px"><h2>需要真实采集？</h2><p class="small muted">云端工作台已接通公开抖音话题榜单和网页素材采集，使用飞书账号登录。</p><a class="btn primary" href="https://shengshu.feishuapp.com/app/app_17hxdqcee1y" target="_blank" rel="noopener noreferrer">进入真实采集版 FRAMEFLOW →</a></div>');
    root.insertAdjacentHTML('afterbegin', '<div class="model-note" style="margin-bottom:22px"><b>FRAMEFLOW · 公开演示版</b><br>灵感、素材、剧本和分镜自动保存在当前浏览器。可导出 JSON 备份；AI 与实时采集尚未在此版本启用。</div>');
    for (const button of document.querySelectorAll(disabledSelector)) {
      button.disabled = true;
      button.title = unavailable;
      button.setAttribute('aria-label', button.textContent.trim() + '（演示版未启用）');
    }
  }
  save = function() { saved = baseSave(); const sync = document.getElementById('project-sync'); if(sync) sync.textContent = saved ? '浏览器已保存' : '保存失败 · 请导出'; return saved; };
  render = function() { baseRender(); decorate(); };
  renderConnectors = function() {
    return `${pageHeader('FRAMEFLOW 使用说明', '在浏览器中，把一个灵感变成可编辑的剧本与分镜计划。')}
      <div class="grid grid3"><section class="panel"><h2>开始创作</h2><p class="small muted">记录原创灵感和固定设定，在创意碰撞中使用规则模板，再逐步编辑剧本、分镜和时间线。</p><button class="btn primary" data-nav="ideas">写下一个灵感 →</button></section>
      <section class="panel"><h2>保存与备份</h2><p class="small muted">数据只保存在当前浏览器，不会上传至 GitHub。更换设备或清理浏览器前，请导出项目 JSON；之后可以在素材库重新导入。</p><button class="btn" data-action="export-project">导出项目 JSON</button><button class="btn" data-action="import-project">导入项目</button></section>
      <section class="panel"><h2>演示范围</h2><p class="small muted">支持灵感编辑、文本与小参考图、链接收藏、规则模板、剧本节点、分镜和项目导出。AI 编剧、实时热榜、视频生成与 MP4 渲染未启用。</p><span class="tag">浏览器规则模板 · 非 AI 生成</span></section></div>`;
  };

  window.frameflowPagesDraft = function(idea, seconds) {
    const draft = makeDraft(idea, null, currentTrend());
    const total = draft.beats.reduce((n, beat) => n + beat.duration, 0);
    const durations = draft.beats.map(beat => Math.max(1, Math.floor(beat.duration * seconds / total)));
    let remaining = seconds - durations.reduce((a,b) => a+b, 0);
    for (let i=0; remaining>0; i++, remaining--) durations[i % durations.length]++;
    draft.beats.forEach((beat, i) => { beat.duration = durations[i]; });
    return draft;
  };
  window.frameflowValidateImport = async function(data) {
    if (!data || !Array.isArray(data.ideas) || !Array.isArray(data.sources) || !Array.isArray(data.shots) || !data.drafts || typeof data.drafts !== 'object' || Array.isArray(data.drafts)) throw Error('不是有效的 FRAMEFLOW 项目 JSON');
    for (const records of [data.ideas, data.sources, data.shots, data.externalTrends || []]) {
      if (!Array.isArray(records) || records.some(x => !x || typeof x.id !== 'string')) throw Error('项目记录缺少有效 id');
    }
    for (const draft of Object.values(data.drafts)) {
      if (!draft || !Array.isArray(draft.beats) || draft.beats.some(x => !x || typeof x.id !== 'string')) throw Error('剧本节点格式错误');
    }
    data.v02 = {trendTab:'samples',duration:60,variants:{},variantMeta:{},analysis:{},draftHistory:{},...data.v02};
  };
  document.addEventListener('click', event => {
    if (event.target.closest('[data-project="sync"]')) {
      event.preventDefault(); event.stopImmediatePropagation(); save();
      toast(saved ? '项目已保存在当前浏览器，建议定期导出备份' : '保存失败，请导出项目 JSON');
    }
    if (event.target.closest(disabledSelector)) {
      event.preventDefault(); event.stopImmediatePropagation(); toast(unavailable);
    }
  }, true);
  render(); save();
})();

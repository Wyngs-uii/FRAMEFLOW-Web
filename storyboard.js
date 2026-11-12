/* Merge revised beats without discarding unrelated hand-edited shots. */
(() => {
  const canonical = value => JSON.stringify(value,(_,item)=>item&&typeof item==='object'&&!Array.isArray(item)?Object.fromEntries(Object.keys(item).sort().map(key=>[key,item[key]])):item);
  const signature = (beat, keep='') => canonical([
    beat.name||'', Number(beat.duration), beat.desc||'', beat.dialogue||'', keep, beat.shots||null
  ]);
  function plan(draft, shots, project, ideaId, createShot, rebuild=false) {
    const same = project?.ideaId === ideaId;
    const baseline = same ? project.beatSignatures||{} : {};
    const signatures = {...baseline};
    const replacements = new Map(), removed = new Set(), locked = new Set();
    let changed = 0, retained = 0;
    const ids = new Set(draft.beats.map(beat=>beat.id));
    for (const [i,beat] of draft.beats.entries()) {
      const previous = same ? shots.filter(shot=>shot.beatId===beat.id&&!shot.manual) : [];
      const key = signature(beat,draft.keep);
      // Legacy projects have no baseline. Preserve their manual work until a beat is edited.
      let prior=baseline[beat.id];try{if(prior)prior=canonical(JSON.parse(prior))}catch{}
      const unchanged = !rebuild && (prior ? prior===key : !beat.editRevision);
      if (same && unchanged && (previous.length || baseline[beat.id])) {
        signatures[beat.id]=key;retained+=previous.length;continue;
      }
      if (previous.some(shot=>shot.status==='已锁定')) {
        locked.add(beat.id);retained+=previous.length;
        signatures[beat.id]=baseline[beat.id]||'locked-legacy';continue;
      }
      const count = beat.shots?.length||Math.max(1,Math.ceil(Number(beat.duration)/60));
      replacements.set(beat.id,Array.from({length:count},(_,part)=>createShot(beat,i,draft.keep,part,count)));
      signatures[beat.id]=key;changed++;
    }
    if (same) for (const shot of shots) {
      if (!shot.manual && !ids.has(shot.beatId) && baseline[shot.beatId]) {
        if (shot.status==='已锁定') locked.add(shot.beatId);
        else removed.add(shot.id);
      }
    }
    const result=[],inserted=new Set();
    if (same) for (const shot of shots) {
      if (removed.has(shot.id)) continue;
      const replacement=!shot.manual&&replacements.get(shot.beatId);
      if (replacement) {
        if (!inserted.has(shot.beatId)) {result.push(...replacement);inserted.add(shot.beatId);}
      } else result.push(shot);
    }
    for (const [id,replacement] of replacements) if(!inserted.has(id))result.push(...replacement);
    for (const id of Object.keys(signatures)) if(!ids.has(id)&&!locked.has(id))delete signatures[id];
    return {shots:result,signatures,changed,retained,removed:removed.size,locked:locked.size,
      replacing:same&&shots.some(shot=>!shot.manual&&replacements.has(shot.beatId))};
  }
  window.frameflowStoryboard={signature,plan};
})();

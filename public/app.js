const $ = id => document.getElementById(id);
let generation = 0;
function node(tag, text = '', cls = '') { const e = document.createElement(tag); e.textContent = text; e.className = cls; return e; }
function message(el, text = '', error = false) { el.textContent = text; el.hidden = !text; el.classList.toggle('error', error); }
function link(text, url, cls = '') { const a = node('a', text, cls); a.href = url; a.target = '_blank'; a.rel = 'noopener'; return a; }
function picture(src, alt) { const img = node('img'); img.src = src; img.alt = alt; img.loading = 'lazy'; img.onerror = () => img.replaceWith(node('span', alt || 'Imagem indisponível', 'image-fallback')); return img; }
async function api(path) { const r = await fetch(`/api/${path}`, {signal:AbortSignal.timeout(30000)}); const data = await r.json(); if (!r.ok) throw new Error(data.message || 'Falha na consulta.'); return data; }
function errorText(e) { return ['TimeoutError','AbortError'].includes(e.name) ? 'A consulta demorou mais que o esperado. Tente novamente.' : e.message; }
const config = api('health').catch(() => ({steamApiConfigured:false}));
config.then(c => { $('config-notice').hidden = c.steamApiConfigured; });
async function openProfile(input) {
  const current = ++generation; $('profile-matches').hidden = true;
  $('results').hidden = true; $('welcome').hidden = true; $('recent-games').replaceChildren();
  message($('recent-status')); message($('search-status'), 'Buscando perfil na Steam…'); $('search-button').disabled = true;
  try {
    const profile = await api(`profiles/resolve?profile=${encodeURIComponent(input)}`);
    if (current !== generation) return;
    $('profile-name').textContent = profile.name; $('steam-id').textContent = profile.steamId;
    $('avatar').hidden = !profile.avatar; if (profile.avatar) $('avatar').src = profile.avatar;
    $('profile-link').href = profile.url; $('visibility').textContent = profile.visibility === 'public' ? 'PERFIL PÚBLICO' : 'PERFIL PRIVADO';
    $('results').hidden = false; message($('search-status')); message($('recent-status'), 'Buscando os últimos jogos…');
    const data = await api(`profiles/${profile.steamId}/recent-games`); const settings = await config;
    if (current !== generation) return;
    message($('recent-status'), data.notice || '');
    data.items.forEach((game, index) => renderGame(game,index,profile.steamId,current,settings.steamApiConfigured));
  } catch(e) { if (current === generation) { message($('recent-status')); message($('search-status'),errorText(e),true); } }
  finally { if (current === generation) $('search-button').disabled = false; }
};
$('search-form').onsubmit = event => {
  event.preventDefault(); const input = $('profile-input').value.trim();
  if (/^\d{17}$/.test(input) || /^(https?:\/\/|steamcommunity\.)/i.test(input)) openProfile(input);
  else searchProfiles(input, 1);
};
$('example').onclick = () => { $('profile-input').value = 'GhostTl'; $('search-form').requestSubmit(); };
async function searchProfiles(name, page) {
  const current = ++generation;
  $('results').hidden = true; $('welcome').hidden = true; $('profile-matches').hidden = true;
  $('search-button').disabled = true; message($('search-status'), 'Procurando perfis pelo nome…');
  try {
    const data = await api(`profiles/search?name=${encodeURIComponent(name)}&page=${page}`);
    if (current !== generation) return;
    message($('search-status'), data.items.length ? 'Escolha o perfil correto. Nomes na Steam podem se repetir.' : 'Nenhum perfil encontrado. Tente outro nome ou informe o SteamID64.');
    $('match-list').replaceChildren();
    for (const profile of data.items) {
      const row = node('button', '', 'profile-match'); row.type = 'button';
      if (profile.avatar) row.append(picture(profile.avatar, ''));
      const text = node('span', '', 'match-info'); text.append(node('strong', profile.name), node('small', profile.url.replace('https://steamcommunity.com/', '')));
      row.append(text, node('span', 'Abrir →', 'match-action'));
      row.onclick = () => openProfile(profile.url);
      $('match-list').append(row);
    }
    $('match-count').textContent = `${data.total.toLocaleString('pt-BR')} perfis · página ${page}`;
    $('match-previous').disabled = page <= 1;
    $('match-next').disabled = !data.hasNext || page >= 100;
    $('match-previous').onclick = () => searchProfiles(name, page - 1);
    $('match-next').onclick = () => searchProfiles(name, page + 1);
    $('profile-matches').hidden = !data.items.length;
  } catch (e) { if (current === generation) message($('search-status'), errorText(e), true); }
  finally { if (current === generation) $('search-button').disabled = false; }
}
function renderGame(game,index,id,current,hasKey) {
  const card = node('article','','recent-game'), top = node('div','','recent-game-top'), identity = node('div','','game-identity');
  identity.append(node('span',`0${index+1} / ÚLTIMOS JOGADOS`,'eyebrow'));
  const cover = link('',`https://steamcommunity.com/app/${game.appId}`,'game-cover');
  cover.append(game.image ? picture(game.image,game.name) : node('span','◇','image-fallback'));
  identity.append(cover,node('h3',game.name));
  const achievements = node('div','','game-achievements'), screenshots = node('section','','game-screenshots');
  screenshots.setAttribute('aria-label',`Capturas de ${game.name}`);
  top.append(identity,achievements); card.append(top,screenshots); $('recent-games').append(card);
  renderAchievements(achievements,game.achievements,id,game.appId);
  if (hasKey) {
    const loading = node('p','Carregando conquistas completas…','subtle'); achievements.append(loading);
    api(`profiles/${id}/achievements/${game.appId}`).then(data => {
      if(current === generation) renderAchievements(achievements,{...data,partial:false},id,game.appId);
    }).catch(e => { if(current === generation) loading.textContent = `${errorText(e)} O resumo público foi preservado.`; });
  }
  renderScreenshots(screenshots,game,id,current);
}
function renderAchievements(container,data,id,appId) {
  container.replaceChildren(); const url = `https://steamcommunity.com/profiles/${id}/achievements/${appId}`;
  const heading = node('div','','game-section-title'); heading.append(node('h4','Conquistas'),link('Ver na Steam ↗',url)); container.append(heading);
  if(data.total === null) { container.append(node('p','Este jogo não apresenta um resumo público de conquistas.','subtle')); return; }
  const summary = node('div','','achievement-count'); summary.append(node('strong',`${data.unlocked} / ${data.total}`),node('span',`desbloqueadas · ${data.percentage ?? 0}%`));
  const progress = node('progress'); progress.max = 100; progress.value = data.percentage || 0; progress.setAttribute('aria-label','Progresso de conquistas'); container.append(summary,progress);
  if(data.partial) container.append(node('p','Prévia das conquistas exibidas no perfil público.','subtle'));
  if(data.warning) container.append(node('p',data.warning,'subtle'));
  const icons = node('div','','achievement-icons');
  for(const a of data.items.slice(0,8)) {
    const tile = link('',url,`achievement-tile ${a.unlocked ? '' : 'locked'}`); tile.title = `${a.name}${a.description ? ` — ${a.description}` : ''}`;
    tile.append(a.icon ? picture(a.icon,a.name) : node('span','★','badge'),node('span',a.name)); icons.append(tile);
  }
  container.append(icons);
  if(!data.partial && data.items.length) {
    const details = node('details','','all-achievements'); details.append(node('summary',`Ver todas as ${data.total} conquistas`));
    const list = node('div','','full-achievements');
    for(const a of data.items) {
      const row = node('div','',`achievement ${a.unlocked ? '' : 'locked'}`); if(a.icon) row.append(picture(a.icon,''));
      const text = node('div'); text.append(node('h4',a.name),node('p',a.description),node('small',a.unlocked ? `Desbloqueada${a.unlockedAt ? ` · ${new Date(a.unlockedAt).toLocaleDateString('pt-BR')}` : ''}` : 'Bloqueada')); row.append(text); list.append(row);
    }
    details.append(list); container.append(details);
  }
}
function renderScreenshots(container,game,id,current) {
  const heading = node('div','','game-section-title'); heading.append(node('h4','Capturas de tela'),link('Galeria na Steam ↗',`https://steamcommunity.com/profiles/${id}/screenshots/?appid=${game.appId}`));
  const status = node('p','','subtle'); status.setAttribute('role','status');
  const strip = node('div','','screenshot-strip'), controls = node('div','','screenshot-controls');
  const previous = node('button','← Anterior','outline'), label = node('span','','subtle'), next = node('button','Próxima →','outline'), retry = node('button','Tentar novamente','outline'); retry.hidden = true;
  controls.append(previous,label,next,retry); container.append(heading,status,strip,controls);
  let page = 1, requestedPage = 1, request = 0;
  async function loadPage(target) {
    const ticket = ++request; requestedPage = target; previous.disabled = next.disabled = true; retry.hidden = true; message(status,'Carregando capturas deste jogo…');
    try {
      const data = await api(`profiles/${id}/screenshots?appId=${game.appId}&page=${target}`);
      if(current !== generation || ticket !== request) return;
      page = target; strip.replaceChildren();
      for(const screenshot of data.items) { const a = link('',screenshot.url,'shot'); a.append(picture(screenshot.imageUrl,`Captura de ${game.name}`)); strip.append(a); }
      message(status,data.items.length ? '' : 'Nenhuma captura pública deste jogo nesta página.');
      previous.disabled = page <= 1; next.disabled = !data.hasNext; label.textContent = `Página ${page}`; controls.hidden = page === 1 && !data.hasNext;
    } catch(e) { if(current === generation && ticket === request) { message(status,errorText(e),true); controls.hidden = false; retry.hidden = false; } }
  }
  previous.onclick = () => loadPage(page-1); next.onclick = () => loadPage(page+1); retry.onclick = () => loadPage(requestedPage); loadPage(1);
}

/* FieldOps collaboration panel. Native browser APIs only; no extra build dependencies.
 * Uses the authenticated `api` helper from index.html; all authorization is server-side.
 */
(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const escapeText = (text = '') => String(text ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const dateTime = (text) => text ? new Date(text).toLocaleString('pl-PL') : '—';
  const state = { organizations:[],members:[],offers:[],organizationId:'',chatRecipient:'',messageSnapshot:'' };
  const errorLine = (area, text, bad = false) => {
    const root = $(area);
    if (root) root.innerHTML = text ? `<div class="message ${bad?'error':''}">${escapeText(text)}</div>` : '';
  };
  const currentOrg = () => state.organizations.find(o => o.id === state.organizationId);
  const safe = async (fn, selector) => {
    try {await fn();}
    catch(e) {errorLine(selector,e.message||'Nie udało się wykonać działania.',true);}
  };
  function avatarUrl(orgId, member) {
    return member.hasAvatar ? `/api/organizations/${encodeURIComponent(orgId)}/members/${encodeURIComponent(member.id)}/avatar` : '/favicon.svg';
  }
  function syncHeaderAvatar() {
    const image = $('#headerAvatar');
    if (!image) return;
    if (user?.hasAvatar) {
      image.src = `/api/me/avatar?t=${Date.now()}`;
      image.classList.remove('hidden');
    } else image.classList.add('hidden');
  }
  function refreshAvatar() {
    syncHeaderAvatar();
    const image = $('#myAvatar');
    if (image) image.src = user?.hasAvatar ? `/api/me/avatar?t=${Date.now()}` : '/favicon.svg';
  }
  async function encodePhoto(file) {
    if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Wybierz zdjęcie JPEG, PNG lub WebP.');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});
      const width = Math.min(image.naturalWidth,512);
      const height = Math.max(1, Math.round(image.naturalHeight * width / image.naturalWidth));
      const canvas = document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(image,0,0,width,height);
      for (const quality of [.82,.68,.5,.35]) {
        const dataUrl = canvas.toDataURL('image/jpeg',quality);
        const base64 = dataUrl.split(',')[1];
        if (base64.length * .75 <= 300*1024) return {mime:'image/jpeg',dataBase64:base64};
      }
      throw new Error('Zdjęcie jest zbyt duże po kompresji. Wybierz mniejszy plik.');
    } finally {URL.revokeObjectURL(url);}
  }
  $('#avatarSave').addEventListener('click', () => safe(async()=>{
    const file=$('#avatarFile').files?.[0];
    if (!file) throw new Error('Najpierw wybierz zdjęcie.');
    $('#avatarSave').disabled=true;
    try {
      await api('/api/me/avatar',{method:'PUT',body:await encodePhoto(file)});
      user.hasAvatar=true;refreshAvatar();$('#avatarFile').value='';
      $('#avatarMessage').textContent='Zdjęcie profilowe zostało zapisane.';
    } finally {$('#avatarSave').disabled=false;}
  },'#avatarMessage'));
  $('#avatarDelete').addEventListener('click',()=>safe(async()=>{
    if (!confirm('Usunąć zdjęcie profilowe?')) return;
    await api('/api/me/avatar',{method:'DELETE'});
    user.hasAvatar=false;refreshAvatar();$('#avatarMessage').textContent='Zdjęcie usunięto.';
  },'#avatarMessage'));

  function renderOrgs() {
    $('#teamOrgsList').innerHTML = state.organizations.length
      ? state.organizations.map(o=>`<div class="team-row"><div><strong>${escapeText(o.name)}</strong><p>${o.memberCount} członków · ${escapeText(o.role)}</p></div></div>`).join('')
      : '<span>Nie należysz jeszcze do żadnej firmy.</span>';
    $('#teamOrgSelect').innerHTML='<option value="">— Wybierz firmę —</option>'+state.organizations.map(o=>
      `<option value="${escapeText(o.id)}">${escapeText(o.name)}</option>`).join('');
    $('#teamOrgSelect').value=state.organizationId;
    const org=currentOrg();
    $('#teamInviteForm').classList.toggle('hidden',!org || !['owner','admin'].includes(org.role));
    $('#teamJobForm').classList.toggle('hidden',!org);
    $('#teamLeave').classList.toggle('hidden',!org || org.role==='owner');
  }
  async function refreshOrganizations() {
    const reply=await api('/api/organizations');
    state.organizations=reply.organizations||[];
    if (!state.organizations.some(o=>o.id===state.organizationId)) state.organizationId=state.organizations[0]?.id||'';
    renderOrgs();
  }
  function renderInvites(invitations) {
    $('#teamInvitesList').innerHTML=invitations.length ? invitations.map(i=>`
      <div class="team-row"><div><strong>${escapeText(i.organizationName)}</strong><p>Zaprasza: ${escapeText(i.invitedBy)}</p></div>
      <div class="team-row-actions"><button data-invitation="${escapeText(i.id)}" data-action="accept">Dołącz</button>
      <button class="secondary" data-invitation="${escapeText(i.id)}" data-action="decline">Odrzuć</button></div></div>`).join('')
      : 'Brak nowych zaproszeń.';
  }
  async function refreshInvites() {renderInvites((await api('/api/invitations')).invitations||[]);}
  function renderMembers() {
    const org=state.organizationId;
    $('#teamMembersList').innerHTML=org ? state.members.map(m=>`
      <div class="team-row"><div class="team-person"><img alt="" class="team-avatar team-avatar-small" src="${avatarUrl(org,m)}">
        <div><strong>${escapeText(m.name)}</strong><p>${escapeText(m.email)} · ${escapeText(m.role)}</p></div></div>
        <div class="team-row-actions">${m.id!==user.id ? `<button class="secondary" data-chat-person="${escapeText(m.id)}">Napisz</button>` : ''}
        ${m.id!==user.id && ['owner','admin'].includes(currentOrg()?.role) && m.role!=='owner' ? `<button class="secondary" data-remove-person="${escapeText(m.id)}">Usuń z firmy</button>` : ''}</div></div>`).join('') || 'Brak członków.' : 'Wybierz firmę.';
    const chat=$('#teamChatRecipient');
    chat.innerHTML='<option value="">Cała firma (czat grupowy)</option>'+
      state.members.filter(m=>m.id!==user.id).map(m=>`<option value="${escapeText(m.id)}">Prywatnie: ${escapeText(m.name)}</option>`).join('');
    if (!state.members.some(m=>m.id===state.chatRecipient)) state.chatRecipient='';
    chat.value=state.chatRecipient;
  }
  function renderOrgJobs(rows) {
    $('#teamJobsList').innerHTML=rows.length ? rows.map(j=>`
      <div class="team-row"><div><strong>${escapeText(j.title)}</strong><p>${escapeText(j.customer)} · ${escapeText(j.assigneeName)} · ${escapeText(j.status)}</p></div>
      ${j.assigneeId===user.id && !['done','cancelled'].includes(j.status) ? `<button class="secondary" data-offer-job="${escapeText(j.id)}">Przekaż</button>`:''}</div>`).join('')
      : 'Brak firmowych zleceń.';
  }
  async function refreshOrgDetails() {
    state.members=[];state.messageSnapshot='';
    if (!state.organizationId) {renderMembers();renderOrgJobs([]);$('#teamChatMessages').innerHTML='Wybierz firmę.';return;}
    const orgId=encodeURIComponent(state.organizationId);
    const [members,jobsList]=await Promise.all([
      api(`/api/organizations/${orgId}/members`),api(`/api/organizations/${orgId}/jobs`)]);
    state.members=members.members||[];renderMembers();renderOrgJobs(jobsList.jobs||[]);
    await refreshChat();
  }
  function channelUrl() {
    const org=encodeURIComponent(state.organizationId);
    return `/api/organizations/${org}/messages${state.chatRecipient?'/'+encodeURIComponent(state.chatRecipient):''}`;
  }
  async function refreshChat() {
    if (!state.organizationId || !user) return;
    const messages=(await api(channelUrl())).messages||[];
    const snapshot=JSON.stringify(messages.map(m=>[m.id,m.content]));
    if (snapshot===state.messageSnapshot) return;
    state.messageSnapshot=snapshot;
    $('#teamChatMessages').innerHTML=messages.length ? messages.map(m=>`
      <div class="team-bubble ${m.senderId===user.id?'own':''}"><small>${escapeText(m.senderName)} · ${escapeText(dateTime(m.createdAt))}</small>${escapeText(m.content)}</div>`).join('')
      : '<div class="team-muted">Nie ma jeszcze wiadomości. Napisz pierwszą.</div>';
    $('#teamChatMessages').scrollTop=$('#teamChatMessages').scrollHeight;
  }
  function showOfferJobs() {
    const sel=$('#offerJobSelect');const before=sel.value;
    const eligible=jobs.filter(j=>!['done','cancelled'].includes(j.status) && !j.report);
    sel.innerHTML='<option value="">Wybierz zlecenie</option>'+eligible.map(j=>
      `<option value="${escapeText(j.id)}">${escapeText(j.title)} — ${escapeText(j.customer)}</option>`).join('');
    if (eligible.some(j=>j.id===before)) sel.value=before;
  }
  function renderOffers() {
    $('#offersList').innerHTML=state.offers.length ? state.offers.map(o=>{
      const incoming=o.recipientId===user.id;
      const statusLabels={pending:'Oczekuje',accepted:'Przyjęto',declined:'Odrzucono',cancelled:'Wycofano',expired:'Wygasło'};
      const actions=o.status==='pending' ? incoming
        ? `<button data-offer-id="${escapeText(o.id)}" data-offer-action="accept">Przyjmij</button><button class="secondary" data-offer-id="${escapeText(o.id)}" data-offer-action="decline">Odrzuć</button>`
        : `<button class="secondary" data-offer-id="${escapeText(o.id)}" data-offer-action="cancel">Wycofaj</button>` : '';
      return `<div class="team-row"><div><strong>${escapeText(o.title)}</strong>
        <p>${incoming?'Od: '+escapeText(o.senderName):'Do: '+escapeText(o.recipientName)} · ${escapeText(statusLabels[o.status]||o.status)}
        ${o.organizationName?' · '+escapeText(o.organizationName):''}</p></div><div class="team-row-actions">${actions}</div></div>`;
    }).join('') : 'Nie masz jeszcze żadnych propozycji przekazania.';
  }
  async function refreshOffers() {state.offers=(await api('/api/job-offers')).offers||[];renderOffers();showOfferJobs();}
  async function open(tab) {
    if (!user) return;
    if (tab==='team') await safe(async()=>{
      await Promise.all([refreshOrganizations(),refreshInvites()]);await refreshOrgDetails();
    },'#teamFeedback');
    if (tab==='offers') await safe(refreshOffers,'#offersFeedback');
  }
  function startOffer(jobId) {
    setTab('offers',true);
    showOfferJobs();$('#offerJobSelect').value=jobId;
    $('#offerForm input[name=toEmail]').focus();
  }
  $('#teamLeave').addEventListener('click',()=>{
    if (!state.organizationId || !confirm('Na pewno opuścić tę firmę?')) return;
    safe(async()=>{await api(`/api/organizations/${encodeURIComponent(state.organizationId)}/leave`,{method:'POST'});
      state.organizationId='';await refreshOrganizations();await refreshOrgDetails();
      errorLine('#teamFeedback','Opuszczono firmę.');},'#teamFeedback');
  });
  $('#teamOrgSelect').addEventListener('change',()=>safe(async()=>{
    state.organizationId=$('#teamOrgSelect').value;state.chatRecipient='';await refreshOrgDetails();
  },'#teamFeedback'));
  // Retain the actual form, not event.currentTarget: browsers clear currentTarget
  // once the synchronous event dispatch ends, including across an `await`.
  // Disable the submit button until completion so a slow request cannot be replayed.
  function bindForm(selector, feedback, action) {
    const form = $(selector);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (form.dataset.submitting === '1') return;
      form.dataset.submitting = '1';
      const button = form.querySelector('button[type="submit"], button:not([type])');
      if (button) button.disabled = true;
      safe(() => action(form), feedback).finally(() => {
        delete form.dataset.submitting;
        if (button) button.disabled = false;
      });
    });
  }
  bindForm('#teamCreateForm', '#teamFeedback', async form => {
    const name = form.elements.name.value.trim();
    const {organization, created} = await api('/api/organizations', {method:'POST', body:{name}});
    form.reset();
    state.organizationId = organization.id;
    await refreshOrganizations();
    await refreshOrgDetails();
    errorLine('#teamFeedback', created === false
      ? 'Firma o tej nazwie już istnieje na Twoim koncie. Wybrano istniejącą firmę.'
      : 'Utworzono firmę. Możesz teraz zapraszać członków.');
  });
  bindForm('#teamInviteForm', '#teamFeedback', async form => {
    const email = form.elements.email.value.trim();
    await api(`/api/organizations/${encodeURIComponent(state.organizationId)}/invites`, {method:'POST', body:{email}});
    form.reset();
    errorLine('#teamFeedback', 'Zaproszenie zostało zapisane. Osoba zobaczy je po zalogowaniu.');
  });
  $('#teamInvitesList').addEventListener('click',e=>{
    const button=e.target.closest('[data-invitation]');if (!button)return;
    safe(async()=>{
      button.disabled=true;
      await api(`/api/invitations/${encodeURIComponent(button.dataset.invitation)}/${button.dataset.action}`,{method:'POST'});
      await Promise.all([refreshInvites(),refreshOrganizations()]);await refreshOrgDetails();
      errorLine('#teamFeedback',button.dataset.action==='accept'?'Dołączono do firmy.':'Odrzucono zaproszenie.');
    },'#teamFeedback').finally(()=>{button.disabled=false;});
  });
  bindForm('#teamJobForm', '#teamFeedback', async form => {
    const fields = Object.fromEntries(new FormData(form));
    const job = {...fields, scheduledAt:fields.scheduledAt+'T12:00:00.000Z'};
    await api(`/api/organizations/${encodeURIComponent(state.organizationId)}/jobs`, {method:'POST', body:job});
    form.reset();
    await refreshOrgDetails();
    await loadJobs();
    errorLine('#teamFeedback', 'Utworzono zlecenie firmowe.');
  });
  $('#teamJobsList').addEventListener('click',e=>{const b=e.target.closest('[data-offer-job]');if(b)startOffer(b.dataset.offerJob);});
  $('#teamMembersList').addEventListener('click',e=>{
    const remove=e.target.closest('[data-remove-person]');
    if (remove) {
      if (!confirm('Usunąć tego członka z firmy?')) return;
      safe(async()=>{
        await api(`/api/organizations/${encodeURIComponent(state.organizationId)}/members/${encodeURIComponent(remove.dataset.removePerson)}`,{method:'DELETE'});
        await Promise.all([refreshOrganizations(),refreshOrgDetails()]);
        errorLine('#teamFeedback','Usunięto członka firmy.');
      },'#teamFeedback');return;
    }
    const b=e.target.closest('[data-chat-person]');if(!b)return;
    state.chatRecipient=b.dataset.chatPerson;$('#teamChatRecipient').value=state.chatRecipient;
    state.messageSnapshot='';safe(refreshChat,'#teamFeedback');
  });
  $('#teamChatRecipient').addEventListener('change',()=>{
    state.chatRecipient=$('#teamChatRecipient').value;
    state.messageSnapshot='';safe(refreshChat,'#teamFeedback');
  });
  bindForm('#teamChatForm', '#teamFeedback', async form => {
    if (!state.organizationId) throw new Error('Wybierz firmę.');
    const content = form.elements.content.value.trim();
    await api(channelUrl(), {method:'POST', body:{content}});
    form.reset();
    await refreshChat();
  });
  $('#teamChatRefresh').addEventListener('click',()=>safe(refreshChat,'#teamFeedback'));
  bindForm('#offerForm', '#offersFeedback', async form => {
    const input = Object.fromEntries(new FormData(form));
    await api('/api/job-offers', {method:'POST', body:input});
    form.reset();
    await refreshOffers();
    errorLine('#offersFeedback', 'Propozycja została wysłana. Odbiorca zobaczy ją w FieldOps.');
  });
  $('#offersList').addEventListener('click',e=>{
    const b=e.target.closest('[data-offer-id]');if(!b)return;
    const action=b.dataset.offerAction;
    if (action==='accept' && !confirm('Przyjąć zlecenie? Po akceptacji będzie należało do Ciebie.')) return;
    safe(async()=>{
      b.disabled=true;
      await api(`/api/job-offers/${encodeURIComponent(b.dataset.offerId)}/${action}`,{method:'POST'});
      await Promise.all([refreshOffers(),loadJobs()]);
      errorLine('#offersFeedback',action==='accept'?'Przyjęto zlecenie. Widać je w Twojej liście.':'Zapisano decyzję.');
    },'#offersFeedback').finally(()=>{b.disabled=false;});
  });
  $('#offersRefresh').addEventListener('click',()=>safe(refreshOffers,'#offersFeedback'));
  setInterval(()=>{
    if (!user || document.hidden) return;
    if (!$('#teamTab').classList.contains('hidden') && state.organizationId) safe(refreshChat,'#teamFeedback');
    if (!$('#offersTab').classList.contains('hidden')) safe(refreshOffers,'#offersFeedback');
  },15_000);
  window.FieldOpsTeam={open,startOffer,refreshAvatar};
  refreshAvatar();
})();

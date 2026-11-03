/* FieldOps UX: in-context attachments and job handoff preview. Uses existing api(), jobs and team UI. */
(() => {
  'use strict';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const $ = q => document.querySelector(q);
  const panel = document.createElement('dialog');
  panel.id='uxAttachments';
  panel.innerHTML=`<div class="ux-content"><div class="ux-top"><h2 id="uxTitle">ZaĹ‚Ä…czniki</h2><button type="button" class="secondary" id="uxClose">Zamknij</button></div>
    <p id="uxContext" class="muted"></p><div id="uxList" aria-live="polite"></div>
    <label class="ux-upload">Dodaj zdjÄ™cie, PDF lub plik TXT (maks. 1,5 MB)<input type="file" id="uxFile" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"></label>
    <p id="uxMessage" role="status"></p></div>`;
  document.body.append(panel);
  const style=document.createElement('style');
  style.textContent=`#uxAttachments{border:0;border-radius:18px;max-width:min(600px,94vw);width:100%;box-shadow:0 20px 80px #14263a55;padding:0}
  #uxAttachments::backdrop{background:#102a43a6}.ux-content{padding:22px;display:grid;gap:14px;background:#fff;color:#16283f}
  .ux-top{display:flex;justify-content:space-between;align-items:center;gap:12px}.ux-top h2{margin:0}.ux-upload{display:grid;gap:8px;padding:12px;border:1px dashed #94a3b8;border-radius:12px}
  .ux-file{display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid #e5e7eb;padding:12px 0;overflow-wrap:anywhere}
  .ux-file button{flex-shrink:0}.ux-handoff-preview{padding:12px;background:#eff6ff;border-radius:10px;line-height:1.6;margin-top:10px}
  .job-actions{flex-wrap:wrap}.ux-chat-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:10px}`;
  document.head.append(style);
  let scope=null;
  $('#uxClose').onclick=()=>panel.close();
  const report = (msg,bad=false)=>{const el=$('#uxMessage');el.textContent=msg;el.style.color=bad?'#b91c1c':'#166534';};
  const fileToBase64 = file => new Promise((resolve,reject)=>{
    const reader=new FileReader();reader.onerror=()=>reject(new Error('Nie moĹĽna odczytaÄ‡ pliku.'));
    reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);
  });
  async function refresh(){
    if(!scope)return;
    const qs=scope.jobId?`jobId=${encodeURIComponent(scope.jobId)}`:`orgId=${encodeURIComponent(scope.orgId)}&otherId=${encodeURIComponent(scope.otherId||'')}`;
    const rows=(await api('/api/attachments?'+qs)).attachments||[];
    $('#uxList').innerHTML=rows.length?rows.map(a=>`<div class="ux-file"><span><strong>${esc(a.fileName)}</strong><br><small>${Math.ceil(a.size/1024)} KB Â· ${esc(a.createdAt)}</small></span><button class="secondary" data-ux-download="${esc(a.id)}" type="button">Pobierz</button></div>`).join(''):'Brak zaĹ‚Ä…cznikĂłw.';
  }
  async function open(next){scope=next;$('#uxTitle').textContent=next.jobId?'ZaĹ‚Ä…czniki zlecenia':'ZaĹ‚Ä…czniki rozmowy';
    $('#uxContext').textContent=next.label||'';report('');panel.showModal();try{await refresh();}catch(e){report(e.message,true);}}
  async function download(id){
    const r=await api('/api/attachments/'+encodeURIComponent(id));
    const a=document.createElement('a');a.href=`data:${r.attachment.mime};base64,${r.dataBase64}`;a.download=r.attachment.fileName;
    document.body.append(a);a.click();a.remove();
  }
  $('#uxList').addEventListener('click',e=>{const id=e.target.closest('[data-ux-download]')?.dataset.uxDownload;if(id)download(id).catch(e=>report(e.message,true));});
  $('#uxFile').addEventListener('change',async e=>{
    const file=e.target.files?.[0];if(!file||!scope)return;
    if(file.size>1_500_000){report('Plik jest zbyt duĹĽy (limit 1,5 MB).',true);return;}
    const mime=file.type||'text/plain';if(!['image/jpeg','image/png','image/webp','application/pdf','text/plain'].includes(mime)){report('NieobsĹ‚ugiwany format.',true);return;}
    e.target.disabled=true;report('WysyĹ‚anieâ€¦');
    try{await api('/api/attachments',{method:'POST',body:{...scope,fileName:file.name,mime,dataBase64:await fileToBase64(file)}});
      report('ZaĹ‚Ä…cznik zapisany.');await refresh();}
    catch(err){report(err.message,true);}finally{e.target.value='';e.target.disabled=false;}
  });
  // Delegate actions: renderJobs() regenerates job cards after every refresh.
  $('#jobsList')?.addEventListener('click',e=>{
    const button=e.target.closest('[data-ux-job]');if(!button)return;
    const j=jobs.find(x=>x.id===button.dataset.uxJob);if(j)void open({jobId:j.id,label:`${j.title} Â· ${j.customer} Â· ${j.address}`});
  });
  // Add attachment buttons without replacing existing job-card actions.
  const list=$('#jobsList');
  if(list){const observer=new MutationObserver(()=>{
    observer.disconnect();list.querySelectorAll('.job-actions').forEach(actions=>{
      const id=actions.querySelector('[data-id]')?.dataset.id;
      if(id&&!actions.querySelector('[data-ux-job]')){
        const b=document.createElement('button');b.className='secondary';b.type='button';b.dataset.uxJob=id;b.textContent='đź“Ž ZaĹ‚Ä…czniki';actions.append(b);
      }
    });observer.observe(list,{childList:true,subtree:true});
  });observer.observe(list,{childList:true,subtree:true});}
  // Chat: keep the existing message form, add an attachment action right beside it.
  const chatForm=$('#teamChatForm');
  if(chatForm){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='đź“Ž Pliki rozmowy';
    const tools=document.createElement('div');tools.className='ux-chat-tools';tools.append(b);chatForm.append(tools);
    b.onclick=()=>{const orgId=$('#teamOrgSelect')?.value;const otherId=$('#teamChatRecipient')?.value||'';
      if(!orgId){alert('Najpierw wybierz firmÄ™.');return;}
      void open({organizationId:orgId,orgId,recipientId:otherId,otherId,label:'Rozmowa firmowa lub prywatna'});
    };}
  // Handoff preview shows the full job details before sending the offer.
  const offer=$('#offerForm');
  if(offer){const preview=document.createElement('div');preview.id='uxOfferPreview';preview.className='ux-handoff-preview';preview.setAttribute('aria-live','polite');
    offer.querySelector('select[name="jobId"]')?.parentElement?.after(preview);
    const update=()=>{const j=jobs.find(x=>x.id===$('#offerJobSelect')?.value);
      preview.innerHTML=j?`<strong>Przekazujesz:</strong> ${esc(j.title)}<br><strong>Klient:</strong> ${esc(j.customer)}<br><strong>Adres:</strong> ${esc(j.address)}<br><strong>Termin:</strong> ${esc(j.scheduledAt)}<br><strong>Opis:</strong> ${esc(j.description||'â€”')}<br><small>ZaĹ‚Ä…czniki zlecenia przejdÄ… razem z nim po akceptacji.</small>`:'Wybierz zlecenie, aby zobaczyÄ‡ jego dane.';};
    $('#offerJobSelect')?.addEventListener('change',update);offer.addEventListener('focusin',update);update();}
  window.FieldOpsAttachments={open};
})();

/* FieldOps: załączniki przy zleceniach i rozmowach, podgląd przekazania. */
(()=>{
'use strict';
const $=q=>document.querySelector(q);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dlg=document.createElement('dialog');dlg.id='foFiles';
dlg.innerHTML='<div class="fo-file-content"><div class="fo-file-head"><h2 id="foFileTitle">Załączniki</h2><button class="secondary" type="button" id="foFileClose">Zamknij</button></div><p id="foFileContext"></p><div id="foFileList"></div><label>Dodaj plik JPEG, PNG, WebP, PDF lub TXT (do 1,5 MB)<input id="foFileInput" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,text/plain"></label><p id="foFileStatus" role="status"></p></div>';
document.body.append(dlg);
const style=document.createElement('style');
style.textContent='#foFiles{border:0;border-radius:16px;max-width:min(640px,94vw);width:100%;padding:0}#foFiles::backdrop{background:#102a43a6}.fo-file-content{padding:20px;display:grid;gap:14px;background:white;color:#1f2937}.fo-file-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.fo-file-row{display:flex;justify-content:space-between;gap:12px;align-items:center;border-bottom:1px solid #e2e8f0;padding:10px 0;overflow-wrap:anywhere}.fo-file-content label{display:grid;gap:8px}.job-actions{flex-wrap:wrap}.fo-offer-preview{padding:12px;background:#eff6ff;border-radius:10px;margin:10px 0;line-height:1.6}';
document.head.append(style);
let scope=null;
$('#foFileClose').onclick=()=>dlg.close();
const status=(v,bad=false)=>{$('#foFileStatus').textContent=v;$('#foFileStatus').style.color=bad?'#b91c1c':'#166534'};
const base64=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Nie udało się odczytać pliku.'));r.onload=()=>resolve(String(r.result).split(',')[1]);r.readAsDataURL(file)});
async function refresh(){
 if(!scope)return;
 const q=scope.jobId?'jobId='+encodeURIComponent(scope.jobId):'orgId='+encodeURIComponent(scope.organizationId)+'&otherId='+encodeURIComponent(scope.recipientId||'');
 const files=(await api('/api/attachments?'+q)).attachments||[];
 $('#foFileList').innerHTML=files.length?files.map(a=>'<div class="fo-file-row"><span><b>'+esc(a.fileName)+'</b><br><small>'+Math.ceil(a.size/1024)+' KB</small></span><button type="button" class="secondary" data-fo-file="'+esc(a.id)+'">Pobierz</button></div>').join(''):'Brak załączników.';
}
async function open(s){scope=s;$('#foFileTitle').textContent=s.jobId?'Załączniki zlecenia':'Pliki rozmowy';$('#foFileContext').textContent=s.label||'';status('');dlg.showModal();try{await refresh()}catch(e){status(e.message,true)}}
$('#foFileList').addEventListener('click',e=>{const id=e.target.closest('[data-fo-file]')?.dataset.foFile;if(!id)return;(async()=>{const r=await api('/api/attachments/'+encodeURIComponent(id));const a=document.createElement('a');a.href='data:'+r.attachment.mime+';base64,'+r.dataBase64;a.download=r.attachment.fileName;document.body.append(a);a.click();a.remove()})().catch(e=>status(e.message,true))});
$('#foFileInput').addEventListener('change',async e=>{const f=e.target.files?.[0];if(!f||!scope)return;if(f.size>1500000){status('Plik przekracza 1,5 MB.',true);return}if(!['image/jpeg','image/png','image/webp','application/pdf','text/plain'].includes(f.type)){status('Nieobsługiwany format.',true);return}e.target.disabled=true;status('Wysyłanie…');try{await api('/api/attachments',{method:'POST',body:{...scope,fileName:f.name,mime:f.type,dataBase64:await base64(f)}});status('Zapisano załącznik.');await refresh()}catch(err){status(err.message,true)}finally{e.target.value='';e.target.disabled=false}});
const list=$('#jobsList');
list?.addEventListener('click',e=>{const b=e.target.closest('[data-fo-job]');if(!b)return;const j=jobs.find(x=>x.id===b.dataset.foJob);if(j)void open({jobId:j.id,label:j.title+' · '+j.customer+' · '+j.address})});
if(list){const observer=new MutationObserver(()=>{observer.disconnect();list.querySelectorAll('.job-actions').forEach(actions=>{const id=actions.querySelector('[data-id]')?.dataset.id;if(id&&!actions.querySelector('[data-fo-job]')){const b=document.createElement('button');b.type='button';b.className='secondary';b.dataset.foJob=id;b.textContent='📎 Załączniki';actions.append(b)}});observer.observe(list,{childList:true,subtree:true})});observer.observe(list,{childList:true,subtree:true})}
const chat=$('#teamChatForm');
if(chat){const b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='📎 Pliki rozmowy';chat.append(b);b.onclick=()=>{const organizationId=$('#teamOrgSelect')?.value,recipientId=$('#teamChatRecipient')?.value||'';if(!organizationId){alert('Najpierw wybierz firmę.');return}void open({organizationId,recipientId,label:'Rozmowa firmowa lub prywatna'})}}
const offer=$('#offerForm');
if(offer){const p=document.createElement('div');p.className='fo-offer-preview';p.setAttribute('aria-live','polite');offer.querySelector('select[name="jobId"]')?.parentElement?.after(p);const update=()=>{const j=jobs.find(x=>x.id===$('#offerJobSelect')?.value);p.innerHTML=j?'<b>Przekazujesz:</b> '+esc(j.title)+'<br><b>Klient:</b> '+esc(j.customer)+'<br><b>Adres:</b> '+esc(j.address)+'<br><b>Termin:</b> '+esc(j.scheduledAt)+'<br><b>Opis:</b> '+esc(j.description||'—')+'<br><small>Załączniki zostaną przy zleceniu.</small>':'Wybierz zlecenie, aby zobaczyć dane.'};$('#offerJobSelect')?.addEventListener('change',update);offer.addEventListener('focusin',update);update()}
})();

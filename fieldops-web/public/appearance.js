(() => {
  const KEY='fieldops_theme';
  const allowed=['system','light','dark'];
  const system=window.matchMedia('(prefers-color-scheme: dark)');
  const read=()=>{try{const v=localStorage.getItem(KEY);return allowed.includes(v)?v:'system'}catch{return 'system'}};
  const apply=()=>{
    const mode=read();
    document.documentElement.dataset.theme=mode==='system'?(system.matches?'dark':'light'):mode;
    document.documentElement.dataset.themePreference=mode;
    const picker=document.getElementById('fieldops-theme-picker');
    if(picker)picker.value=mode;
  };
  const init=()=>{
    if(document.getElementById('fieldops-theme-picker'))return;
    const user=document.querySelector('header .user');
    if(!user)return;
    const label=document.createElement('label');
    label.className='theme-picker';
    label.innerHTML='<span>Motyw</span><select id="fieldops-theme-picker" aria-label="Motyw aplikacji"><option value="system">Systemowy</option><option value="light">Jasny</option><option value="dark">Ciemny</option></select>';
    user.prepend(label);
    label.querySelector('select').addEventListener('change',e=>{try{localStorage.setItem(KEY,e.target.value)}catch{}apply()});
    apply();
  };
  apply();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  system.addEventListener('change',()=>{if(read()==='system')apply()});
  window.addEventListener('storage',e=>{if(e.key===KEY)apply()});
})();

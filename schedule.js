// ══════════════════════════════════════════
//  SHIFT TYPES
// ══════════════════════════════════════════
const SHIFTS = [
  { code:'吧',   label:'吧台', bg:'#bbdefb', fg:'#0d47a1' },
  { code:'廚',   label:'廚房', bg:'#ffe0b2', fg:'#bf360c' },
  { code:'外',   label:'外場', bg:'#c8e6c9', fg:'#1b5e20' },
  { code:'文書', label:'文書', bg:'#e1bee7', fg:'#4a148c' },
  { code:'備',   label:'備班', bg:'#fff9c4', fg:'#f57f17' },
  { code:'休',   label:'休假', bg:'#ffccbc', fg:'#bf360c' },
  { code:'21-2', label:'PT', bg:'#c5cae9', fg:'#1a237e' },
  { code:'',     label:'清空', bg:'#f5f5f5', fg:'#9e9e9e' },
];
let customShifts = [];
let hiddenBuiltins = new Set();
function getShifts(){ return [...SHIFTS.slice(0,-1).filter(s=>!hiddenBuiltins.has(s.code)), ...customShifts, SHIFTS[SHIFTS.length-1]]; }
let SMAP = {};
function updateSMAP(){ SMAP = Object.fromEntries(getShifts().map(s=>[s.code,s])); }
const WDS = ['日','一','二','三','四','五','六'];

// ══════════════════════════════════════════
//  FIXED NOTES (always shown, cannot delete)
// ══════════════════════════════════════════
const FIXED_NOTES = [
  {text:'週二為固定公休日',            color:'#333333'},
  {text:'清冷氣濾網與製冰機',          color:'#2e7d32', dateKey:'green'},
  {text:'清潔油槽',                    color:'#c62828', dateKey:'red'},
  {text:'禮拜五六為最忙碌時期盡可能全員到齊！', color:'#c62828'},
];

const DEF_EMPS = ['Eric','Teen','Sue','Susan','Sharon','小黃','阿維','子芯'];

// 人員技能（動態，可透過 UI 修改）
const DEF_SKILLS = {
  'Eric':   ['吧'],
  'Teen':   ['廚'],
  'Sue':    ['文書','外'],
  'Susan':  ['外','備','廚'],
  'Sharon': ['外','備'],
  '小黃':   ['外','吧','廚'],
  '阿維':   ['吧','備'],
  '子芯':   ['21-2'],
};
let empSkills = {};
function getSkillOpts(){ return getShifts().filter(s=>s.code&&s.code!=='休'); } // 可選技能班別
const EXEMPT_EMPS = new Set(['Eric','Teen','Sue']); // 不受8天限制
const REST_PER_MONTH = 8;

// ══════════════════════════════════════════
//  STATE
// ══════════════════════════════════════════
let cy, cm; // current year/month
let data  = {};
let emps  = [];
let editCell = null, selShift = null;
let pubHols = [];      // [{date, localName}] for current month

// ══════════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════════
const mkey = (y,m) => `${y||cy}-${String(m||cm).padStart(2,'0')}`;
const daysIn = (y,m) => new Date(y,m,0).getDate();
const dow    = (y,m,d) => new Date(y,m-1,d).getDay();
const pad2   = n => String(n).padStart(2,'0');
const ds     = (y,m,d) => `${y}-${pad2(m)}-${pad2(d)}`;

function ensureMonth(y,m){
  const k=mkey(y,m);
  if(!data[k]) data[k]={schedule:{},notes:[],fixedDates:{}};
  emps.forEach(e=>{ if(!data[k].schedule[e]) data[k].schedule[e]={}; });
}
function save(){ localStorage.setItem('tls_data',JSON.stringify(data)); localStorage.setItem('tls_emps',JSON.stringify(emps)); localStorage.setItem('tls_skills',JSON.stringify(empSkills)); localStorage.setItem('tls_custom_shifts',JSON.stringify(customShifts)); localStorage.setItem('tls_hidden_builtins',JSON.stringify([...hiddenBuiltins])); }
function hexAlpha(hex,a){ const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; }

// ══════════════════════════════════════════
//  PUBLIC HOLIDAYS (Taiwan built-in data)
// ══════════════════════════════════════════
// 台灣國定假日（含行政院公告之彈性放假）
const TW_HOLIDAYS = {
  2026: [
    {date:'2026-01-01', localName:'元旦'},
    {date:'2026-02-16', localName:'農曆除夕（彈性放假）'},
    {date:'2026-02-17', localName:'春節'},
    {date:'2026-02-18', localName:'春節'},
    {date:'2026-02-19', localName:'春節'},
    {date:'2026-02-20', localName:'春節'},
    {date:'2026-02-28', localName:'和平紀念日'},
    {date:'2026-04-03', localName:'兒童節'},
    {date:'2026-04-04', localName:'清明節'},
    {date:'2026-04-06', localName:'清明節補假'},
    {date:'2026-05-01', localName:'勞動節'},
    {date:'2026-06-19', localName:'端午節'},
    {date:'2026-09-25', localName:'中秋節'},
    {date:'2026-10-09', localName:'國慶日（彈性放假）'},
    {date:'2026-10-10', localName:'國慶日'},
  ],
  2027: [
    {date:'2027-01-01', localName:'元旦'},
    {date:'2027-02-05', localName:'農曆除夕'},
    {date:'2027-02-06', localName:'春節'},
    {date:'2027-02-07', localName:'春節'},
    {date:'2027-02-08', localName:'春節'},
    {date:'2027-02-09', localName:'春節'},
    {date:'2027-02-10', localName:'春節'},
    {date:'2027-03-01', localName:'和平紀念日補假'},
    {date:'2027-02-28', localName:'和平紀念日'},
    {date:'2027-04-04', localName:'兒童節'},
    {date:'2027-04-05', localName:'清明節'},
    {date:'2027-05-01', localName:'勞動節'},
    {date:'2027-06-09', localName:'端午節'},
    {date:'2027-09-29', localName:'中秋節'},
    {date:'2027-10-10', localName:'國慶日'},
    {date:'2027-10-11', localName:'國慶日補假'},
  ],
};

function loadPubHols(){
  pubHols = (TW_HOLIDAYS[cy]||[]).filter(h=>h.date.startsWith(`${cy}-${pad2(cm)}`));
}

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
function init(){
  const sd=localStorage.getItem('tls_data'), se=localStorage.getItem('tls_emps'), ss=localStorage.getItem('tls_skills'), sc=localStorage.getItem('tls_custom_shifts'), sh=localStorage.getItem('tls_hidden_builtins');
  if(sd) try{ data=JSON.parse(sd); }catch(e){}
  if(se) try{ emps=JSON.parse(se); }catch(e){}
  if(ss) try{ empSkills=JSON.parse(ss); }catch(e){}
  if(sc) try{ customShifts=JSON.parse(sc); }catch(e){}
  if(sh) try{ hiddenBuiltins=new Set(JSON.parse(sh)); }catch(e){}
  updateSMAP();
  if(!emps.length) emps=[...DEF_EMPS];
  // 預設技能補齊（未曾設定過的員工）
  emps.forEach(e=>{ if(!empSkills[e]) empSkills[e]=DEF_SKILLS[e]||[]; });

  // Remove any fixed notes or legacy holiday notes that were previously stored
  const fixedTexts=new Set(FIXED_NOTES.map(n=>n.text));
  const legacyRe=/清明連假|\d+\/\d+.*連假/;
  Object.values(data).forEach(md=>{
    if(md.notes) md.notes=md.notes.filter(n=>!fixedTexts.has(n.text)&&!legacyRe.test(n.text));
  });

  const t=new Date(); cy=t.getFullYear(); cm=t.getMonth()+1;
  ensureMonth(cy,cm);
  loadPubHols();
  renderAll();
}

// ══════════════════════════════════════════
//  RENDER
// ══════════════════════════════════════════
function renderAll(){ renderLabel(); renderLegend(); renderTable(); renderNotes(); renderStats(); }

function renderLabel(){ document.getElementById('monthLabel').textContent=`${cy} 年 ${cm} 月`; }

function renderLegend(){
  document.getElementById('legend').innerHTML=
    getShifts().filter(s=>s.code).map(s=>
      `<div class="leg-item"><div class="leg-clr" style="background:${s.bg};color:${s.fg}">${s.code.substring(0,2)}</div><span>${s.label}</span></div>`
    ).join('');
}

function extractNoteDays(notes){
  // Returns {day: color} for dates found in note text matching current month
  const map={};
  const maxD=daysIn(cy,cm);
  notes.forEach(n=>{
    const t=n.text;
    // "X月Y日" or "X月Y號" or "X/Y"
    for(const m of t.matchAll(/(\d{1,2})[月\/](\d{1,2})[日號]?/g)){
      if(parseInt(m[1])===cm){ const d=parseInt(m[2]); if(d>=1&&d<=maxD) map[d]=n.color; }
    }
    // standalone "Y日" or "Y號" (without month prefix)
    for(const m of t.matchAll(/(?<![\/\d])(\d{1,2})[日號]/g)){
      const d=parseInt(m[1]); if(d>=1&&d<=maxD) map[d]=n.color;
    }
  });
  return map;
}
function renderTable(){
  const k=mkey(); const md=data[k]||{}; const days=daysIn(cy,cm);
  const fd=md.fixedDates||{};
  // Build a map: day number -> border color (from fixedDates)
  const DATED_KEYS=[{key:'green',color:'#2e7d32'},{key:'red',color:'#c62828'}];
  const colBorder={};
  // Note dates first (lower priority)
  Object.assign(colBorder, extractNoteDays(md.notes||[]));
  // fixedDates override note dates
  DATED_KEYS.forEach(({key,color})=>{ if(fd[key]) colBorder[parseInt(fd[key])]=color; });
  let h='<thead><tr><th class="th-name">姓名</th>';
  for(let d=1;d<=days;d++){
    const dstr=ds(cy,cm,d); const dw=dow(cy,cm,d);
    const isHol=pubHols.some(h=>h.date===dstr);
    let cl='th-day';
    if(isHol) cl+=' hol';
    else if(dw===6) cl+=' sat';
    else if(dw===0) cl+=' sun';
    else if(dw===5) cl+=' fri';
    const hoverTitle=isHol?'國定假日':dw>=1&&dw<=4?'平日':dw===5?'星期五':dw===6?'星期六':'星期日';
    const bc=colBorder[d];
    const thStyle=bc?`box-shadow:inset 2px 0 0 ${bc},inset -2px 0 0 ${bc},inset 0 3px 0 ${bc};`:'';
    h+=`<th class="${cl}" style="${thStyle}" title="${hoverTitle}"><div class="wd">${WDS[dw]}</div><div class="dn">${d}</div></th>`;
  }
  h+='</tr></thead><tbody>';
  emps.forEach((e,ei)=>{
    const isLast=ei===emps.length-1;
    const esch=((md.schedule||{})[e]||{});
    h+=`<tr><td class="td-name">${e}</td>`;
    for(let d=1;d<=days;d++){
      const dstr=ds(cy,cm,d); const dw2=dow(cy,cm,d);
      const sh=dw2===2?'休':(esch[dstr]||''); const s=SMAP[sh];
      const bg=s?s.bg:'#fafafa'; const fg=s?s.fg:'#bbb';
      const bc=colBorder[d];
      const shadow=bc?(isLast?`box-shadow:inset 2px 0 0 ${bc},inset -2px 0 0 ${bc},inset 0 -3px 0 ${bc};`:`box-shadow:inset 2px 0 0 ${bc},inset -2px 0 0 ${bc};`):'';
      const clickable=dw2===2?'':`onclick="openShiftModal('${e}','${dstr}')"`;
      h+=`<td class="sc" style="background:${bg};color:${fg};${shadow}" ${clickable} title="${e} ${cm}/${d}">${sh||'—'}</td>`;
    }
    h+='</tr>';
  });
  h+='</tbody>';
  document.getElementById('schTable').innerHTML=h;
}

function renderNotes(){
  const k=mkey(); const notes=(data[k]||{}).notes||[];
  const el=document.getElementById('notesList');
  let idx=1;
  const fixedDates=(data[k]||{}).fixedDates||{};
  const fixedHtml=FIXED_NOTES.map(n=>{
    if(n.dateKey){
      const day=fixedDates[n.dateKey]||'';
      return `<li style="background:${hexAlpha(n.color,.09)}">
        <span class="nt" style="color:${n.color}">${idx++}. ${cm}月<input type="text" inputmode="numeric" value="${day}" placeholder="" style="width:2.8em;margin:0 2px;text-align:center;border:1px solid ${n.color};border-radius:3px;color:${n.color};font-weight:700" onchange="saveFixedDate('${n.dateKey}',this.value)">日 ${n.text}</span>
      </li>`;
    }
    return `<li style="background:${hexAlpha(n.color,.09)}">
      <span class="nt" style="color:${n.color}">${idx++}. ${n.text}</span>
    </li>`;
  }).join('');
  const pubHolHtml=pubHols.length
    ? `<li style="background:${hexAlpha('#c62828',.07)}">
      <span class="nt" style="color:#c62828">${idx++}. 國定假日 ${pubHols.map(h=>{const[,mo,d]=h.date.split('-');return `${+mo}/${+d} ${h.localName}`;}).join('、')}</span>
    </li>`
    : '';
  const userHtml=notes.map((n,i)=>
    `<li style="background:${hexAlpha(n.color,.09)}">
      <span class="nt" style="color:${n.color}">${idx++}. ${n.text}</span>
      <button class="nd" onclick="delNote(${i})" title="刪除">✕</button>
    </li>`
  ).join('');
  el.innerHTML=fixedHtml+pubHolHtml+userHtml || '<li style="color:#aaa;font-size:.82rem;padding:4px 0">尚無注意事項</li>';
}

function renderStats(){
  const k=mkey(); const md=data[k]||{}; const codes=getShifts().filter(s=>s.code).map(s=>s.code);
  const st={};
  const days2=daysIn(cy,cm);
  emps.forEach(e=>{
    st[e]={}; codes.forEach(c=>{st[e][c]=0;}); st[e]._w=0;
    const esch=(md.schedule||{})[e]||{};
    for(let d=1;d<=days2;d++){
      const sh=dow(cy,cm,d)===2?'休':(esch[ds(cy,cm,d)]||'');
      if(sh && st[e][sh]!==undefined){ st[e][sh]++; if(sh!=='休') st[e]._w++; }
    }
  });
  let h='<div style="overflow-x:auto"><table class="stbl"><thead><tr><th>姓名</th>';
  codes.forEach(c=>{ const s=SMAP[c]; h+=`<th><span class="sbadge" style="background:${s.bg};color:${s.fg}">${c}</span></th>`; });
  h+='<th class="tot">工作天</th></tr></thead><tbody>';
  emps.forEach(e=>{
    h+=`<tr><td>${e}</td>`;
    codes.forEach(c=>{ const v=st[e][c]; const s=SMAP[c]; h+=`<td style="${v?`background:${s.bg};color:${s.fg};font-weight:700`:''}">${v||'—'}</td>`; });
    h+=`<td class="tot">${st[e]._w}</td></tr>`;
  });
  h+='</tbody></table></div>';
  document.getElementById('statsContent').innerHTML=h;
}

// ══════════════════════════════════════════
//  NOTES
// ══════════════════════════════════════════
function saveFixedDate(key,val){
  const k=mkey(); ensureMonth(cy,cm);
  const d=parseInt(val);
  data[k].fixedDates[key]=(d>=1&&d<=daysIn(cy,cm))?d:'';
  save(); renderTable();
}
function addNote(){
  const inp=document.getElementById('noteInput'); const text=inp.value.trim(); if(!text) return;
  const k=mkey(); ensureMonth(cy,cm);
  data[k].notes.push({text,color:document.getElementById('noteColor').value});
  inp.value=''; clearDraft('noteInput'); save(); renderNotes(); renderTable();
}
function delNote(i){ const k=mkey(); data[k].notes.splice(i,1); save(); renderNotes(); renderTable(); }

// ══════════════════════════════════════════
//  SHIFT MODAL
// ══════════════════════════════════════════
function openShiftModal(e,dstr){
  editCell={e,dstr};
  const k=mkey(); selShift=((data[k]||{}).schedule||{})[e]?.[dstr]||'';
  const [y,mo,d]=dstr.split('-');
  document.getElementById('shiftModalTitle').textContent=`${e} — ${+mo}/${+d} (${WDS[dow(+y,+mo,+d)]})`;
  renderPicker();
  document.getElementById('shiftModal').classList.add('open');
}
function renderPicker(){
  const skills=new Set(empSkills[editCell?.e]||[]);
  // 固定可選：休假、清空；其餘依員工技能過濾（含自訂班別）
  const allowed=getShifts().filter(s=>!s.code||s.code==='休'||skills.has(s.code));
  document.getElementById('shiftPicker').innerHTML=
    allowed.map(s=>`<div class="sopt${selShift===s.code?' sel':''}" style="background:${s.bg};color:${s.fg};border-color:${selShift===s.code?s.fg:'transparent'}" onclick="pickShift('${s.code}')">${s.code||'清空'}</div>`
  ).join('');
}
function pickShift(c){ selShift=c; renderPicker(); }
function saveShift(){
  if(!editCell) return;
  const {e,dstr}=editCell; const k=mkey(); ensureMonth(cy,cm);
  if(!data[k].schedule[e]) data[k].schedule[e]={};
  data[k].schedule[e][dstr]=selShift;
  save(); renderTable(); renderStats(); closeShiftModal();
}
function closeShiftModal(){
  document.getElementById('shiftModal').classList.remove('open');
  editCell=null; selShift=null;
}

// ══════════════════════════════════════════
//  EMPLOYEE MODAL
// ══════════════════════════════════════════
function openEmpModal(){ renderEmpList(); document.getElementById('empModal').classList.add('open'); }
function renderEmpList(){
  document.getElementById('empList').innerHTML=
    emps.map((e,i)=>{
      const sk=empSkills[e]||[];
      const badges=getSkillOpts().map(o=>
        `<span class="sk-badge${sk.includes(o.code)?' on':''}" style="background:${o.bg};color:${o.fg}" onclick="toggleEmpSkill(${i},'${o.code}')">${o.code||o.label}</span>`
      ).join('');
      return `<li>
        <div class="er">
          <span class="en">${e}</span>
          <div class="ea">
            <button class="ebtn" onclick="moveEmp(${i},-1)" ${i===0?'disabled':''}>↑</button>
            <button class="ebtn" onclick="moveEmp(${i},1)" ${i===emps.length-1?'disabled':''}>↓</button>
            <button class="ebtn del" onclick="removeEmp(${i})">刪除</button>
          </div>
        </div>
        <div class="eskills">${badges}</div>
      </li>`;
    }).join('');
}
function toggleEmpSkill(i,code){
  const e=emps[i]; if(!empSkills[e]) empSkills[e]=[];
  const idx=empSkills[e].indexOf(code);
  if(idx>=0) empSkills[e].splice(idx,1); else empSkills[e].push(code);
  save(); renderEmpList();
}
function addEmployee(){
  const inp=document.getElementById('newEmpInput'); const n=inp.value.trim();
  if(!n||emps.includes(n)) return;
  emps.push(n); inp.value=''; clearDraft('newEmpInput'); ensureMonth(cy,cm); save(); renderEmpList(); renderTable(); renderStats();
}
function removeEmp(i){
  if(!confirm(`確定刪除員工「${emps[i]}」？`)) return;
  emps.splice(i,1); save(); renderEmpList(); renderTable(); renderStats();
}
function moveEmp(i,d){
  const j=i+d; if(j<0||j>=emps.length) return;
  [emps[i],emps[j]]=[emps[j],emps[i]]; save(); renderEmpList(); renderTable();
}
function closeEmpModal(){ document.getElementById('empModal').classList.remove('open'); }

// ══════════════════════════════════════════
//  MONTH NAV
// ══════════════════════════════════════════
function chMonth(d){
  cm+=d; if(cm>12){cm=1;cy++;} if(cm<1){cm=12;cy--;}
  ensureMonth(cy,cm);
  loadPubHols();
  renderAll();
}
function goToday(){
  const t=new Date(); cy=t.getFullYear(); cm=t.getMonth()+1;
  ensureMonth(cy,cm);
  loadPubHols();
  renderAll();
}
function clearMonthConfirm(){
  if(!confirm(`確定清空 ${cy} 年 ${cm} 月 所有班表？`)) return;
  const k=mkey();
  data[k]={schedule:{},notes:[],fixedDates:{}};
  ensureMonth(cy,cm); save(); renderAll();
}
// 驗證當天工作人員能否符合最低人力需求
// 需求：總計>=4、廚>=1、吧>=1、外(含PT)>=2
// 優先順序依 emps 陣列（管理員可透過 UI 調整）；備班兼廚／外需同時具備對應技能
function canStaff(workers){
  if(workers.length<4) return false;
  const rem=new Set(workers);
  const hasSk=(e,sk)=>(empSkills[e]||[]).includes(sk);
  // 廚：非備班員工優先；無人時 5 人以上可由備班兼廚補入
  const chef=emps.find(e=>rem.has(e)&&hasSk(e,'廚')&&!hasSk(e,'備'))
    ||(workers.length>=5 ? emps.find(e=>rem.has(e)&&hasSk(e,'備')&&hasSk(e,'廚')) : null);
  if(!chef) return false;
  rem.delete(chef);
  // 吧：依 emps 順序找有吧技能者
  const bar=emps.find(e=>rem.has(e)&&hasSk(e,'吧'));
  if(!bar) return false;
  rem.delete(bar);
  // 外（含 PT）：依 emps 順序，找有外或 21-2 技能者
  let fc=0;
  for(const e of emps){
    if(rem.has(e)&&(hasSk(e,'外')||hasSk(e,'21-2'))){ rem.delete(e); fc++; }
    if(fc>=2) break;
  }
  if(fc>=2) return true;
  // 外場不足：5 人以上且備班兼外者可補一個缺口
  if(workers.length>=5 && fc===1){
    const sb=emps.find(e=>hasSk(e,'備')&&hasSk(e,'外')&&rem.has(e));
    if(sb) return true;
  }
  return false;
}

function assignDayShifts(workers, esch, d){
  const dstr=ds(cy,cm,d);
  const done=new Set();
  const set=(e,sh)=>{ if(!esch[e]) esch[e]={}; esch[e][dstr]=sh; done.add(e); };
  const avail=e=>workers.includes(e)&&!done.has(e)&&!esch[e]?.[dstr];
  const hasSk=(e,sk)=>(empSkills[e]||[]).includes(sk);
  // 依 emps 順序篩選：非備班技能 / 備班兼指定技能（管理員可透過排序調整優先順序）
  const noStandby=sk=>emps.filter(e=>workers.includes(e)&&hasSk(e,sk)&&!hasSk(e,'備'));
  const standbyFor=sk=>emps.filter(e=>workers.includes(e)&&hasSk(e,'備')&&hasSk(e,sk));

  const dw=dow(cy,cm,d);
  const isHoliday=pubHols.some(h=>h.date===dstr);
  const useBei=workers.length>=5 && dw!==5 && dw!==6 && !isHoliday; // 5人以上且非五六及國定假日才排備班

  // 廚（1人）：非備班員工優先，依 emps 順序
  let kitchenFilled=false;
  for(const e of noStandby('廚')){ if(avail(e)){set(e,'廚');kitchenFilled=true;break;} }
  // 吧（1人）：非備班員工優先，依 emps 順序
  let barFilled=false;
  for(const e of noStandby('吧')){ if(avail(e)){set(e,'吧');barFilled=true;break;} }
  // PT 員工（21-2技能）固定排 21-2，計入外場人數
  let floorN=0;
  emps.filter(e=>workers.includes(e)&&hasSk(e,'21-2')).forEach(e=>{ if(avail(e)){set(e,'21-2');floorN++;} });
  // 外場（非備班優先，補足至2人）
  for(const e of noStandby('外')){
    if(floorN>=2) break;
    if(avail(e)){ set(e,'外'); floorN++; }
  }
  // 每天最多一位備班
  let beiUsed=false;
  const sh4bei=(_,actual)=>{ if(useBei&&!beiUsed){beiUsed=true;return '備';}return actual; };

  // 備班補廚房缺口：依 emps 順序
  if(!kitchenFilled){
    for(const e of standbyFor('廚')){ if(avail(e)){set(e,sh4bei(e,'廚'));kitchenFilled=true;break;} }
  }
  // 備班補外場缺口：依 emps 順序
  for(const e of standbyFor('外')){
    if(floorN>=2) break;
    if(avail(e)){ set(e,sh4bei(e,'外')); floorN++; }
  }
  // 備班補吧台缺口：依 emps 順序
  if(!barFilled){
    for(const e of standbyFor('吧')){ if(avail(e)){set(e,sh4bei(e,'吧'));barFilled=true;break;} }
  }
  // 外場充足後考慮第2位吧台（非備班優先）
  if(floorN>=2){
    for(const e of noStandby('吧')){ if(avail(e)){set(e,'吧');break;} }
  }
  // 剩餘員工：useBei 且有備班技能且當天備班尚未使用 → 備；否則排第一技能
  workers.forEach(e=>{
    const sk=empSkills[e]||[];
    if(avail(e)&&sk.length&&!hasSk(e,'21-2')){
      if(useBei&&hasSk(e,'備')&&!beiUsed){ set(e,'備'); beiUsed=true; }
      else{ set(e,sk[0]); }
    }
  });
}

function autoSchedule(){
  if(!confirm(`自動排班將填入 ${cy} 年 ${cm} 月 所有空白格，已手動填寫的班別不受影響，確定繼續？`)) return;
  const k=mkey(); ensureMonth(cy,cm);
  const md=data[k]; const days=daysIn(cy,cm);
  emps.forEach(e=>{ if(!md.schedule[e]) md.schedule[e]={}; });

  // 自動休假日（僅週二；國定假日視為普通工作日，可排班也可排休）
  const autoRestSet=new Set();
  for(let d=1;d<=days;d++){ if(dow(cy,cm,d)===2) autoRestSet.add(d); }

  // 每天確認休假名單（從已手動設定中建立）
  const offSet={}; // day -> Set<emp>
  for(let d=1;d<=days;d++){
    offSet[d]=new Set();
    if(autoRestSet.has(d)){ emps.forEach(e=>offSet[d].add(e)); continue; }
    emps.forEach(e=>{ if(md.schedule[e][ds(cy,cm,d)]==='休') offSet[d].add(e); });
  }

  // ── Phase 1：分配休假日 ──
  // 非豁免、非PT員工，依需求補足8天休
  const restQuota={};
  emps.forEach(e=>{
    if(EXEMPT_EMPS.has(e)||(empSkills[e]||[]).includes('21-2')||(empSkills[e]||[]).length===0){ restQuota[e]=0; return; }
    const manualRest=Object.values(md.schedule[e]).filter(v=>v==='休').length;
    restQuota[e]=Math.max(0, REST_PER_MONTH - autoRestSet.size - manualRest);
  });

  // 候選休假日：按員工平均分散
  emps.forEach(e=>{
    if(!restQuota[e]) return;
    const candidates=[];
    for(let d=1;d<=days;d++){
      if(autoRestSet.has(d)||md.schedule[e][ds(cy,cm,d)]) continue;
      candidates.push(d);
    }
    const needed=Math.min(restQuota[e], candidates.length);
    const step=candidates.length/needed;
    const picks=Array.from({length:needed},(_,i)=>candidates[Math.round(i*step)||i*Math.floor(step)]);
    // 驗證人力後寫入
    for(const d of picks){
      const workers=emps.filter(w=>!offSet[d].has(w)&&w!==e);
      if(canStaff(workers)){
        md.schedule[e][ds(cy,cm,d)]='休';
        offSet[d].add(e);
      }
    }
  });

  // ── Phase 2：填入班別 ──
  for(let d=1;d<=days;d++){
    if(autoRestSet.has(d)) continue;
    const workers=emps.filter(e=>!offSet[d].has(e));
    const eSchMap={};
    workers.forEach(e=>{ eSchMap[e]=md.schedule[e]; });
    assignDayShifts(workers, eSchMap, d);
  }

  save(); renderTable(); renderStats();
}

// ══════════════════════════════════════════
//  SHIFT TYPE MODAL
// ══════════════════════════════════════════
function openShiftTypeModal(){
  renderBuiltinShiftList();
  renderCustomShiftList();
  document.getElementById('shiftTypeModal').classList.add('open');
}
function closeShiftTypeModal(){ document.getElementById('shiftTypeModal').classList.remove('open'); }

function renderBuiltinShiftList(){
  document.getElementById('builtinShiftList').innerHTML =
    SHIFTS.filter(s=>s.code).map(s=>{
      const hidden=hiddenBuiltins.has(s.code);
      return `<li class="stm-item${hidden?' stm-hidden':''}">
        <span class="stm-badge" style="background:${s.bg};color:${s.fg}">${s.code}</span>
        <span class="stm-lbl">${s.label}</span>
        ${hidden
          ? `<button class="ebtn" onclick="restoreBuiltin('${s.code}')">還原</button>`
          : `<button class="ebtn del" onclick="hideBuiltin('${s.code}')">刪除</button>`}
      </li>`;
    }).join('');
}
function hideBuiltin(code){
  hiddenBuiltins.add(code);
  updateSMAP(); save();
  renderBuiltinShiftList(); renderLegend(); renderTable(); renderStats();
}
function restoreBuiltin(code){
  hiddenBuiltins.delete(code);
  updateSMAP(); save();
  renderBuiltinShiftList(); renderLegend(); renderTable(); renderStats();
}
function renderCustomShiftList(){
  const el=document.getElementById('customShiftList');
  if(!customShifts.length){
    el.innerHTML='<li style="color:#aaa;font-size:.82rem;padding:4px 0">尚無自訂班別</li>';
    return;
  }
  el.innerHTML=customShifts.map((s,i)=>
    `<li class="stm-item">
      <span class="stm-badge" style="background:${s.bg};color:${s.fg}">${s.code}</span>
      <span class="stm-lbl">${s.label}</span>
      <button class="ebtn del" onclick="removeCustomShift(${i})">刪除</button>
    </li>`
  ).join('');
}
function randomShiftColor(){
  // pick a hue not too close to existing shifts, step by 10°
  const usedHues = getShifts().filter(s=>s.bg&&s.bg.startsWith('hsl')).map(s=>parseInt(s.bg.match(/\d+/)[0]));
  const candidates = Array.from({length:36},(_,i)=>i*10).filter(h=>usedHues.every(u=>Math.min(Math.abs(h-u),360-Math.abs(h-u))>=20));
  const hue = candidates.length ? candidates[Math.floor(Math.random()*candidates.length)] : Math.floor(Math.random()*36)*10;
  return { bg:`hsl(${hue},62%,90%)`, fg:`hsl(${hue},68%,24%)` };
}
function addCustomShift(){
  const code=document.getElementById('csCode').value.trim();
  const label=document.getElementById('csLabel').value.trim();
  if(!code||!label){ alert('請填寫代碼與名稱'); return; }
  if(getShifts().some(s=>s.code===code)){ alert(`班別代碼「${code}」已存在`); return; }
  const {bg,fg}=randomShiftColor();
  customShifts.push({code,label,bg,fg});
  updateSMAP();
  save();
  renderCustomShiftList();
  renderLegend();
  renderStats();
  document.getElementById('csCode').value=''; clearDraft('csCode');
  document.getElementById('csLabel').value=''; clearDraft('csLabel');
}
function removeCustomShift(i){
  if(!confirm(`確定刪除自訂班別「${customShifts[i].label}」？已排入的班表代碼將保留但不顯示顏色。`)) return;
  customShifts.splice(i,1);
  updateSMAP();
  save();
  renderCustomShiftList();
  renderLegend();
  renderTable();
  renderStats();
}

// ══════════════════════════════════════════
//  CLOSE ON OUTSIDE CLICK / ESC
// ══════════════════════════════════════════
document.getElementById('shiftModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeShiftModal(); });
document.getElementById('empModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeEmpModal(); });
document.getElementById('shiftTypeModal').addEventListener('click',e=>{ if(e.target===e.currentTarget) closeShiftTypeModal(); });
document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ closeShiftModal(); closeEmpModal(); closeShiftTypeModal(); } });

// ══════════════════════════════════════════
//  DRAFT & AUTO-SAVE
// ══════════════════════════════════════════
const DRAFT_IDS = ['noteInput','newEmpInput','csCode','csLabel'];
function clearDraft(id){ localStorage.removeItem('tls_draft_'+id); }
function initDrafts(){
  DRAFT_IDS.forEach(id=>{
    const el=document.getElementById(id); if(!el) return;
    const saved=localStorage.getItem('tls_draft_'+id);
    if(saved) el.value=saved;
    el.addEventListener('input',()=>localStorage.setItem('tls_draft_'+id,el.value));
  });
}
// 切換分頁或關閉視窗前強制存檔
document.addEventListener('visibilitychange',()=>{ if(document.hidden) save(); });
window.addEventListener('beforeunload',()=> save());

init();
initDrafts();

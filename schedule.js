// ══════════════════════════════════════════
//  SHIFT TYPES
// ══════════════════════════════════════════
const SHIFTS = [
  { code:'吧',   label:'吧台', bg:'#bbdefb', fg:'#0d47a1' },
  { code:'廚',   label:'廚房', bg:'#ffe0b2', fg:'#bf360c' },
  { code:'外',   label:'外場', bg:'#c8e6c9', fg:'#1b5e20' },
  { code:'文書', label:'文書', bg:'#e1bee7', fg:'#4a148c' },
  { code:'備',   label:'備班', bg:'#fff9c4', fg:'#f57f17' },
  { code:'休',   label:'休假', bg:'#ffab91', fg:'#bf360c' },
  { code:'特休', label:'特別休假', bg:'#dcedc8', fg:'#33691e' },
  { code:'20-2', label:'PT', bg:'#bbdefb', fg:'#0d47a1' },
  { code:'21-2', label:'PT', bg:'#c5cae9', fg:'#1a237e' },
  { code:'',     label:'清空', bg:'#f5f5f5', fg:'#9e9e9e' },
];
let customShifts = [];
let hiddenBuiltins = new Set();
function getShifts(){ return [...SHIFTS.slice(0,-1).filter(s=>!hiddenBuiltins.has(s.code)), ...customShifts, SHIFTS[SHIFTS.length-1]]; }
let SMAP = {};
function updateSMAP(){ SMAP = Object.fromEntries(getShifts().map(s=>[s.code,s])); }
function isRestShift(sh){
  if(!sh) return false;
  if(sh==='休'||sh.includes('休')) return true;
  const cs=customShifts.find(s=>s.code===sh);
  return cs?(cs.label.includes('休')||cs.label.includes('假')):false;
}
const WDS = ['日','一','二','三','四','五','六'];

// ══════════════════════════════════════════
//  FIXED NOTES (always shown, cannot delete)
// ══════════════════════════════════════════
const FIXED_NOTES = [
  {text:'清冷氣濾網與製冰機',          color:'#2e7d32', dateKey:'green'},
  {text:'清潔油槽',                    color:'#1565c0', dateKey:'red'},
  {text:'月會',                        color:'#6a1b9a', dateKey:'meeting'},
  {text:'禮拜五六為最忙碌時期盡可能全員到齊！', color:'#c62828'},
];

let DEF_EMPS = ['Eric','Teen','Sue','Sharon','阿維','子芯']; // 動態預設名單，隨新增/刪除同步
// 人員技能（動態，可透過 UI 修改，無預設值）
let empSkills = {};
function getSkillOpts(){ return getShifts().filter(s=>s.code&&!isRestShift(s.code)); } // 可選技能班別
const REST_PER_MONTH = 8;
const REST_FLOOR = 8; // 個人應休天數過多排不下時，至少須排足的天數（其餘計入欠假）

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
// 某人某日的班別代碼（缺資料時回傳空字串）
const getCell = (md,e,dstr) => ((md.schedule||{})[e]||{})[dstr]||'';
// 班別基底代碼：備班附時段（備16~1）歸為「備」
const baseCode = c => c.startsWith('備')?'備':c;

function ensureMonth(y,m){
  const k=mkey(y,m);
  if(!data[k]) data[k]={schedule:{},notes:[],fixedDates:{},closedDays:[],restOverride:{}};
  emps.forEach(e=>{ if(!data[k].schedule[e]) data[k].schedule[e]={}; });
}
function save(){ localStorage.setItem('tls_data',JSON.stringify(data)); localStorage.setItem('tls_emps',JSON.stringify(emps)); localStorage.setItem('tls_def_emps',JSON.stringify(DEF_EMPS)); localStorage.setItem('tls_skills',JSON.stringify(empSkills)); localStorage.setItem('tls_custom_shifts',JSON.stringify(customShifts)); localStorage.setItem('tls_hidden_builtins',JSON.stringify([...hiddenBuiltins])); }
function exportData(){
  const payload={data,emps,empSkills,customShifts,hiddenBuiltins:[...hiddenBuiltins]};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='排班資料_'+new Date().toISOString().slice(0,10)+'.json';
  a.click(); URL.revokeObjectURL(a.href);
}
function importData(e){
  const file=e.target.files[0]; if(!file) return;
  const reader=new FileReader();
  reader.onload=ev=>{
    try{
      const p=JSON.parse(ev.target.result);
      if(!p.data||!p.emps) throw new Error('格式錯誤');
      if(!confirm('確定匯入？目前資料將被覆蓋。')){ e.target.value=''; return; }
      data=p.data; emps=p.emps; DEF_EMPS=[...emps]; empSkills=p.empSkills||{}; customShifts=p.customShifts||[]; hiddenBuiltins=new Set(p.hiddenBuiltins||[]);
      updateSMAP(); save(); renderAll();
    }catch(err){ alert('匯入失敗：'+err.message); }
    e.target.value='';
  };
  reader.readAsText(file);
}
function hexAlpha(hex,a){ const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16); return `rgba(${r},${g},${b},${a})`; }
function openModal(id){ document.getElementById(id).classList.add('open'); }
function closeModal(id){ document.getElementById(id).classList.remove('open'); }

// ══════════════════════════════════════════
//  PUBLIC HOLIDAYS (Taiwan calendar API)
// ══════════════════════════════════════════
// 台灣國定假日（含補假、彈性放假）由 API 取得：isHoliday 且有 caption 者為國定假日（單純週末無 caption）
const HOLIDAY_API='https://api.pin-yi.me/taiwan-calendar';
const holCache={};   // year -> Promise<[{date, localName}]>
const escHtml=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function fetchYearHols(y){
  if(!holCache[y]){
    holCache[y]=fetch(`${HOLIDAY_API}/${y}/`)
      .then(r=>{ if(!r.ok) throw new Error(r.status); return r.json(); })
      // 外部資料：驗證日期格式並跳脫名稱，避免被插入 HTML/腳本
      .then(list=>(Array.isArray(list)?list:[])
        .filter(d=>d&&d.isHoliday===true&&typeof d.caption==='string'&&d.caption&&/^\d{8}$/.test(d.date))
        .map(d=>({date:`${d.date.slice(0,4)}-${d.date.slice(4,6)}-${d.date.slice(6,8)}`, localName:escHtml(d.caption)})))
      .catch(err=>{ delete holCache[y]; console.warn('國定假日載入失敗',err); return []; });
  }
  return holCache[y];
}
// 先以空清單渲染，API 回應後若仍在同一個月份則重新渲染
function loadPubHols(){
  const y=cy, m=cm;
  pubHols=[];
  fetchYearHols(y).then(list=>{
    if(cy!==y||cm!==m) return;
    pubHols=list.filter(h=>h.date.startsWith(`${y}-${pad2(m)}`));
    if(pubHols.length) renderAll();
  });
}
function isHolidayDate(dstr){ return pubHols.some(h=>h.date===dstr); }
// 週五、週六、國定假日（最忙碌日：自動排班不排休、不排備班、不設公休）
function isBusyDay(y,m,d){ const w=dow(y,m,d); return w===5||w===6||isHolidayDate(ds(y,m,d)); }

// ══════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════
function init(){
  const sd=localStorage.getItem('tls_data'), se=localStorage.getItem('tls_emps'), sde=localStorage.getItem('tls_def_emps'), ss=localStorage.getItem('tls_skills'), sc=localStorage.getItem('tls_custom_shifts'), sh=localStorage.getItem('tls_hidden_builtins');
  if(sd) try{ data=JSON.parse(sd); }catch(e){}
  if(se) try{ emps=JSON.parse(se); }catch(e){}
  if(sde) try{ DEF_EMPS=JSON.parse(sde); }catch(e){}
  if(ss) try{ empSkills=JSON.parse(ss); }catch(e){}
  if(sc) try{ customShifts=JSON.parse(sc); }catch(e){}
  if(sh) try{ hiddenBuiltins=new Set(JSON.parse(sh)); }catch(e){}
  updateSMAP();
  if(se===null) emps=[...DEF_EMPS]; // 僅在從未存過員工名單時才套用預設名單，避免刪光後被復活
  // 技能補齊（未曾設定過的員工，無預設值）
  emps.forEach(e=>{ if(!empSkills[e]) empSkills[e]=[]; });

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
function renderAll(){ renderLabel(); renderLegend(); renderTable(); renderNotes(); renderStats(); renderRestOverride(); }

function renderLabel(){ document.getElementById('monthLabel').textContent=`${cy} 年 ${cm} 月`; }

function renderLegend(){
  document.getElementById('legend').innerHTML=
    getShifts().filter(s=>s.code).map(s=>
      `<div class="leg-item"><div class="leg-clr" style="background:${s.bg};color:${s.fg}">${s.code.substring(0,2)}</div><span>${s.label}</span></div>`
    ).join('');
}

function extractNoteDays(notes){
  const map={};
  const maxD=daysIn(cy,cm);
  const fill=(d1,d2,color)=>{ for(let d=Math.max(1,d1);d<=Math.min(maxD,d2);d++) map[d]=color; };
  notes.forEach(n=>{
    const t=n.text;
    let m;
    // Range: "X/Y~X/Z" or "X月Y日~X月Z日" or "X/Y~Z" (end month optional)
    const reRange=/(\d{1,2})[月\/](\d{1,2})[日號]?\s*[~～]\s*(?:(\d{1,2})[月\/])?(\d{1,2})[日號]?/g;
    while((m=reRange.exec(t))!==null){
      if(parseInt(m[1])!==cm) continue;
      const d1=parseInt(m[2]), d2=parseInt(m[4]);
      if(d1<=d2) fill(d1,d2,n.color);
    }
    // Range: "Y日~Z日" standalone
    const reDayRange=/(?:^|[^\/\d])(\d{1,2})[日號]\s*[~～]\s*(\d{1,2})[日號]/g;
    while((m=reDayRange.exec(t))!==null){
      const d1=parseInt(m[1]), d2=parseInt(m[2]);
      if(d1<=d2) fill(d1,d2,n.color);
    }
    // Single: "X月Y日" or "X/Y"
    const re1=/(\d{1,2})[月\/](\d{1,2})[日號]?/g;
    while((m=re1.exec(t))!==null){
      if(parseInt(m[1])===cm){ const d=parseInt(m[2]); if(d>=1&&d<=maxD) map[d]=n.color; }
    }
    // Standalone "Y日" or "Y號"
    const re2=/(?:^|[^\/\d])(\d{1,2})[日號]/g;
    while((m=re2.exec(t))!==null){
      const d=parseInt(m[1]); if(d>=1&&d<=maxD) map[d]=n.color;
    }
  });
  return map;
}
// 該日實際班別：公休日的空白格視為「休」
function effShift(md,e,y,m,d){
  const s=getCell(md,e,ds(y,m,d));
  return (md.closedDays||[]).includes(d)?(s||'休'):s;
}
function daySpans(days,chunkSize){
  const out=[];
  for(let s=1;s<=days;s+=chunkSize) out.push([s,Math.min(s+chunkSize-1,days)]);
  // 避免最後一組天數過少（例如 31 天會剩下孤零零的 1 天），改併入前一組
  if(out.length>1){
    const last=out[out.length-1];
    const lastLen=last[1]-last[0]+1;
    if(lastLen<chunkSize/2){
      out[out.length-2][1]=last[1];
      out.pop();
    }
  }
  return out;
}

function buildTableRows(md,colBorder,closedDays,startDay,endDay){
  let h='<thead><tr><th class="th-name">姓名</th>';
  for(let d=startDay;d<=endDay;d++){
    const dstr=ds(cy,cm,d); const dw=dow(cy,cm,d);
    const isHol=isHolidayDate(dstr);
    const isClosed=closedDays.has(d);
    let cl='th-day';
    if(isClosed) cl+=' closed-day';
    else if(isHol) cl+=' hol';
    else if(dw===6) cl+=' sat';
    else if(dw===0) cl+=' sun';
    else if(dw===5) cl+=' fri';
    const hoverTitle=isClosed?'公休日（店休）':isHol?'國定假日':dw>=1&&dw<=4?'平日':dw===5?'星期五':dw===6?'星期六':'星期日';
    const closedLabel=isClosed?'<div class="closed-lbl">公休</div>':'';
    h+=`<th class="${cl}" title="${hoverTitle}"><div class="wd">${WDS[dw]}</div><div class="dn">${d}</div>${closedLabel}</th>`;
  }
  h+='</tr></thead><tbody>';
  emps.forEach(e=>{
    h+=`<tr><td class="td-name">${e}</td>`;
    for(let d=startDay;d<=endDay;d++){
      const dstr=ds(cy,cm,d);
      const sh=effShift(md,e,cy,cm,d);
      // 顏色：先查完整代碼，找不到時取第一個部分的基底代碼（備16~1 → 備）
      const s=SMAP[sh]||(sh?SMAP[baseCode(sh.split('/')[0])]:undefined);
      const fg=s?s.fg:(sh?'#555':'#bbb'); const bc=colBorder[d];
      const hasBg=s&&SMAP[sh]&&(isRestShift(sh)||customShifts.some(cs=>cs.code===sh));
      const bgStyle=hasBg?`background:${s.bg};`:bc?`background:${hexAlpha(bc,.13)};`:'';
      // 顯示：備班時段統一拉到下方，代碼們排同一行
      let cellContent=sh||'—';
      if(sh){
        const parts=sh.split('/');
        let beiTime='';
        const labels=parts.map(p=>{ if(p.startsWith('備')&&p.length>1){beiTime=p.slice(1);return '備';} return p; });
        cellContent=beiTime
          ?`${labels.join('/')}<div style="font-size:.6rem;font-weight:500;line-height:1.2;margin-top:1px">${beiTime}</div>`
          :labels.join('/');
      }
      h+=`<td class="sc" style="${bgStyle}color:${fg};" onclick="openShiftModal('${e}','${dstr}')" title="${e} ${cm}/${d}">${cellContent}</td>`;
    }
    h+='</tr>';
  });
  const dayCountCell=(d,content,style)=>{
    const bc=colBorder[d];
    const bg=closedDays.has(d)?`background:#ffcdd2;`:bc?`background:${hexAlpha(bc,.13)};`:'';
    return closedDays.has(d)
      ?`<td class="sc day-count-cell" style="${bg}">—</td>`
      :`<td class="sc day-count-cell" style="${bg}${style}">${content}</td>`;
  };
  // Daily unfilled count row (hidden on print)
  h+='<tr class="day-count-row"><td class="td-name day-count-label">未填入</td>';
  for(let d=startDay;d<=endDay;d++){
    const dstr=ds(cy,cm,d);
    const empty=emps.filter(e=>!getCell(md,e,dstr)).length;
    h+=dayCountCell(d,empty,empty>0?'color:#c0392b;':'color:#27ae60;');
  }
  h+='</tr>';
  // Daily operating count row (hidden on print)
  h+='<tr class="day-count-row"><td class="td-name day-count-label">營業人數</td>';
  for(let d=startDay;d<=endDay;d++){
    const dstr=ds(cy,cm,d);
    const op=emps.filter(e=>{ const sh=getCell(md,e,dstr); return sh&&!isRestShift(sh)&&!sh.startsWith('備')&&sh!=='文書'; }).length;
    h+=dayCountCell(d,op,'color:#1565c0;font-weight:700;');
  }
  h+='</tr>';
  h+='</tbody>';
  return h;
}

function renderTable(){
  const k=mkey(); const md=data[k]||{}; const days=daysIn(cy,cm);
  const fd=md.fixedDates||{};
  const closedDays=new Set(md.closedDays||[]);
  const DATED_KEYS=FIXED_NOTES.filter(n=>n.dateKey).map(n=>({key:n.dateKey,color:n.color}));
  const colBorder={};
  Object.assign(colBorder, extractNoteDays(md.notes||[]));
  DATED_KEYS.forEach(({key,color})=>{ if(fd[key]) colBorder[parseInt(fd[key])]=color; });

  document.getElementById('schTable').innerHTML=buildTableRows(md,colBorder,closedDays,1,days);

  // 列印版：每 15 天切一組，每組各自獨立成一頁，避免被切成兩頁
  const printEl=document.getElementById('schTablePrint');
  if(printEl){
    printEl.innerHTML=daySpans(days,15).map(([s,e])=>
      `<div class="print-page-block"><table class="sch-table">${buildTableRows(md,colBorder,closedDays,s,e)}</table></div>`
    ).join('');
  }
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
  el.innerHTML=fixedHtml+pubHolHtml+userHtml;
}

function renderStats(){
  const k=mkey(); const md=data[k]||{}; const codes=getShifts().filter(s=>s.code).map(s=>s.code);
  const st={};
  const days2=daysIn(cy,cm);
  emps.forEach(e=>{
    st[e]={}; codes.forEach(c=>{st[e][c]=0;}); st[e]._w=0;
    for(let d=1;d<=days2;d++){
      const sh=effShift(md,e,cy,cm,d);
      if(sh){
        if(st[e][sh]!==undefined){ st[e][sh]++; if(!isRestShift(sh)) st[e]._w++; }
        else if(sh.includes('/')){
          // 組合班別：拆開分別計數，整天算 1 個工作天
          const parts=sh.split('/');
          let counted=false;
          parts.forEach(p=>{
            const base=baseCode(p);
            if(st[e][base]!==undefined){ st[e][base]++; counted=true; }
          });
          if(counted&&!isRestShift(sh)) st[e]._w++;
        } else if(sh.startsWith('備')&&st[e]['備']!==undefined){
          // 備班附時段（如「備 14:00」）歸入備欄
          st[e]['備']++; st[e]._w++;
        }
      }
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

function getMaxClosed(){
  const md=data[mkey()]||{};
  return md.maxClosedDays!=null?md.maxClosedDays:4;
}
function setMaxClosed(val){
  const k=mkey(); ensureMonth(cy,cm);
  const n=parseInt(val);
  data[k].maxClosedDays=isNaN(n)||n<0?0:Math.min(14,n);
  save();
}
// 個人本月應休天數（自動排班依此安排，至少須達到；多休不倒扣）；null = 未填且休假手動處理者（PT／未設技能）
function getRestTarget(md,e){
  const ov=md.restOverride||{};
  if(e in ov) return ov[e]||0;
  const sk=empSkills[e]||[];
  if(sk.includes('21-2')||sk.includes('20-2')||sk.length===0) return null;
  return REST_PER_MONTH;
}
// 該月實際休假天數（含公休日；公休日內填了工作班別者不算）
function monthRestCount(k,e){
  const md=data[k]||{}; const [y,m]=k.split('-').map(Number);
  let n=0;
  for(let d=1;d<=daysIn(y,m);d++) if(isRestShift(effShift(md,e,y,m,d))) n++;
  return n;
}
// 欠假 = 應休天數 − 實際休假天數（僅限已自動排班的月份）；所有人員未填天數時以預設 8 天計，多休不倒扣
function getOwedLeave(k,e){
  const md=data[k]; if(!md||!md.autoRan) return 0;
  const t=getRestTarget(md,e)??REST_PER_MONTH;
  return Math.max(0,t-monthRestCount(k,e));
}
function getOwedTotal(e){
  const cur=mkey();
  return Object.keys(data).filter(k=>k<=cur).reduce((s,k)=>s+getOwedLeave(k,e),0);
}
function renderRestOverride(){
  const k=mkey(); const md=data[k]||{};
  const ov=md.restOverride||{};
  const inp=document.getElementById('maxClosedInput');
  if(inp) inp.value=getMaxClosed();
  document.getElementById('restOverrideList').innerHTML=
    emps.map(e=>{
      const owed=getOwedLeave(k,e), total=getOwedTotal(e);
      const owedHtml=(data[k]||{}).autoRan||total
        ?`<span class="ro-unit" style="color:${owed||total?'#c62828':'#888'};font-weight:${owed||total?700:400}">欠假 ${owed} 天${total!==owed?`（累計 ${total} 天）`:''}</span>`:'';
      return `<div class="ro-row">
      <span class="ro-name">${e}</span>
      <input type="number" min="0" max="31" class="ro-input" value="${e in ov?ov[e]:REST_PER_MONTH}" onchange="setRestOverride('${e}',this.value)">
      <span class="ro-unit">天</span>${owedHtml}
    </div>`;
    }).join('');
}
function setRestOverride(e,val){
  const k=mkey(); ensureMonth(cy,cm);
  if(!data[k].restOverride) data[k].restOverride={};
  const n=parseInt(val);
  if(val===''||isNaN(n)) delete data[k].restOverride[e];
  else data[k].restOverride[e]=Math.max(0,Math.min(31,n));
  save(); renderRestOverride();
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
  const k=mkey();
  const stored=getCell(data[k]||{},e,dstr);
  // 備班時段分離：'備 14:00' → selShift='備', beiTimeInput='14:00'
  if(stored.startsWith('備')&&stored.length>1){ selShift='備'; document.getElementById('beiTimeInput').value=stored.slice(1); }
  else { selShift=stored; document.getElementById('beiTimeInput').value=''; }
  const [y,mo,d]=dstr.split('-');
  document.getElementById('shiftModalTitle').textContent=`${e} — ${+mo}/${+d} (${WDS[dow(+y,+mo,+d)]})`;
  renderPicker();
  openModal('shiftModal');
}
function renderPicker(){
  const skills=new Set(empSkills[editCell.e]||[]);
  // 固定可選：休假、清空；其餘依員工技能過濾（含自訂班別）
  const allowed=getShifts().filter(s=>!s.code||isRestShift(s.code)||skills.has(s.code));
  const selected=selShift?selShift.split('/').filter(Boolean):[];
  let html=allowed.map(s=>{
    const isSel=s.code?selected.includes(s.code):selShift==='';
    return `<div class="sopt${isSel?' sel':''}" style="background:${s.bg};color:${s.fg};border-color:${isSel?s.fg:'transparent'}" onclick="pickShift('${s.code}')">${s.code||'清空'}</div>`;
  }).join('');
  if(selected.length>1) html+=`<div class="spicker-preview">已選：${selShift}</div>`;
  document.getElementById('shiftPicker').innerHTML=html;
  document.getElementById('beiTimeRow').style.display=selected.includes('備')?'flex':'none';
}
function pickShift(c){
  if(!c){ selShift=''; document.getElementById('beiTimeInput').value=''; renderPicker(); return; }
  if(isRestShift(c)){ selShift=c; document.getElementById('beiTimeInput').value=''; renderPicker(); return; }
  // 工作班別 = toggle 多選
  const parts=selShift?selShift.split('/').filter(x=>x&&!isRestShift(x)):[];
  const idx=parts.indexOf(c);
  if(idx>=0) parts.splice(idx,1); else parts.push(c);
  selShift=parts.join('/');
  if(!parts.includes('備')) document.getElementById('beiTimeInput').value='';
  renderPicker();
}
// 手動調整後同步公休標示：全員休假 → 標為公休；公休日有人填入工作班別 → 取消公休
// （取消時，其他人原本顯示的「休」轉為實際休假）
function syncClosedDay(k,dstr){
  const md=data[k]; const dayNum=parseInt(dstr.split('-')[2]);
  const cds=md.closedDays||[];
  const isClosed=cds.includes(dayNum);
  const shOf=e=>getCell(md,e,dstr);
  if(!isClosed){
    if(emps.length&&emps.every(e=>isRestShift(shOf(e)))) md.closedDays=[...cds,dayNum].sort((a,b)=>a-b);
    return;
  }
  if(emps.some(e=>{ const s=shOf(e); return s&&!isRestShift(s); })){
    emps.forEach(e=>{
      if(!md.schedule[e]) md.schedule[e]={};
      if(!md.schedule[e][dstr]) md.schedule[e][dstr]='休';
    });
    md.closedDays=cds.filter(d=>d!==dayNum);
  }
}
function saveShift(){
  if(!editCell) return;
  const {e,dstr}=editCell; const k=mkey(); ensureMonth(cy,cm);
  // 備班時段：'備' + ' ' + 時段文字
  let finalShift=selShift;
  if(selShift==='備'||selShift.split('/').includes('備')){
    const t=document.getElementById('beiTimeInput').value.trim();
    if(t) finalShift=selShift==='備'?`備${t}`:selShift.split('/').map(p=>p==='備'?`備${t}`:p).join('/');
  }
  data[k].schedule[e][dstr]=finalShift;
  syncClosedDay(k,dstr);
  save(); renderTable(); renderStats(); renderRestOverride(); closeShiftModal();
  const allV=[];
  if(selShift&&!isRestShift(selShift)){
    const [y2,m2,d2]=dstr.split('-').map(Number);
    const streak=consecWorkStreak(e,y2,m2,d2);
    if(streak>=7) allV.push(`${e} 連續工作 ${streak} 天（上限 6 天）`);
  }
  allV.push(...getStaffingViolations(dstr));
  if(allV.length) showStaffWarn(allV,dstr);
}
function _checkStaffingRoles(operationalWorkers){
  const violations=[]; const hasSk=activeHasSk; const rem=new Set(operationalWorkers);
  const chef=emps.find(e=>rem.has(e)&&hasSk(e,'廚'));
  if(!chef){ violations.push('缺少廚房人員（廚）'); } else { rem.delete(chef); }
  const bar=emps.find(e=>rem.has(e)&&hasSk(e,'吧'));
  if(!bar){ violations.push('缺少吧台人員（吧）'); } else { rem.delete(bar); }
  let fc=0;
  for(const e of emps){
    if(rem.has(e)&&(hasSk(e,'外')||hasSk(e,'21-2')||hasSk(e,'20-2'))){ rem.delete(e); fc++; }
    if(fc>=2) break;
  }
  if(fc<2) violations.push(`外場人數不足 2 人（外／PT，目前 ${fc} 人）`);
  return violations;
}
function getStaffingViolations(dstr){
  const md=data[mkey()]||{};
  const isStandby=e=>getCell(md,e,dstr).startsWith('備');
  const workers=emps.filter(e=>!isRestShift(getCell(md,e,dstr)));
  const operationalWorkers=workers.filter(e=>!isStandby(e));
  const violations=[];
  if(operationalWorkers.length<4){ violations.push(`營業時間人數不足 4 人（目前 ${operationalWorkers.length} 人，備班不計）`); return violations; }
  if(workers.length<5&&workers.some(isStandby))
    violations.push(`在班人數不足 5 人，不應排備班（目前 ${workers.length} 人）`);
  violations.push(..._checkStaffingRoles(operationalWorkers));
  return violations;
}
function showStaffWarn(violations,dstr){
  const [y,mo,d]=dstr.split('-').map(Number);
  document.getElementById('staffWarnDate').textContent=`${y} 年 ${mo} 月 ${d} 日`;
  document.getElementById('staffWarnList').innerHTML=violations.map(v=>`<li>${v}</li>`).join('');
  openModal('staffWarnModal');
}
function closeStaffWarnModal(){ closeModal('staffWarnModal'); }
function closeShiftModal(){
  closeModal('shiftModal');
  editCell=null; selShift=null;
}

// ══════════════════════════════════════════
//  EMPLOYEE MODAL
// ══════════════════════════════════════════
function openEmpModal(){ renderEmpList(); openModal('empModal'); }
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
  emps.push(n);
  if(!DEF_EMPS.includes(n)) DEF_EMPS.push(n);
  inp.value=''; clearDraft('newEmpInput'); ensureMonth(cy,cm); save(); renderEmpList(); renderTable(); renderStats();
}
function removeEmp(i){
  const name=emps[i];
  if(!confirm(`確定刪除員工「${name}」？`)) return;
  emps.splice(i,1);
  const di=DEF_EMPS.indexOf(name);
  if(di>=0) DEF_EMPS.splice(di,1);
  save(); renderEmpList(); renderTable(); renderStats();
}
function moveEmp(i,d){
  const j=i+d; if(j<0||j>=emps.length) return;
  [emps[i],emps[j]]=[emps[j],emps[i]]; save(); renderEmpList(); renderTable();
}
function closeEmpModal(){ closeModal('empModal'); }

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
  data[k]={schedule:{},notes:[],fixedDates:{},closedDays:[],restOverride:{}};
  ensureMonth(cy,cm); save(); renderAll();
}
function activeHasSk(e,sk){ return getShifts().some(s=>s.code===sk)&&(empSkills[e]||[]).includes(sk); }
function canStaff(workers){
  if(workers.length<4) return false;
  return _checkStaffingRoles(workers).length===0;
}

function consecWorkStreak(e,year,month,day){
  const getOff=(y2,m2,d2)=>{
    const k2=mkey(y2,m2);
    const cd=new Set((data[k2]||{}).closedDays||[]);
    if(cd.has(d2)) return true;
    const sh=getCell(data[k2]||{},e,ds(y2,m2,d2));
    return !sh||isRestShift(sh);
  };
  let before=0,ty=year,tm=month,td=day-1;
  while(before<31){if(td<1){tm--;if(tm<1){tm=12;ty--;}td=daysIn(ty,tm);}if(getOff(ty,tm,td))break;before++;td--;}
  let after=0;ty=year;tm=month;td=day+1;
  while(after<31){if(td>daysIn(ty,tm)){tm++;if(tm>12){tm=1;ty++;}td=1;}if(getOff(ty,tm,td))break;after++;td++;}
  return before+1+after;
}

function countBeiDays(y,m,wdFrom,wdTo,schOf){
  let n=0;
  for(let wd=wdFrom;wd<=wdTo;wd++){
    const wdstr=ds(y,m,wd);
    for(const e2 of emps){ if(((schOf(e2)||{})[wdstr]||'').startsWith('備')) n++; }
  }
  return n;
}
function assignDayShifts(workers, esch, d){
  const dstr=ds(cy,cm,d);
  const done=new Set();
  const set=(e,sh)=>{ if(!esch[e]) esch[e]={}; esch[e][dstr]=sh; done.add(e); };
  const avail=e=>workers.includes(e)&&!done.has(e)&&!(esch[e]&&esch[e][dstr]);
  const hasSk=activeHasSk;

  const dw=dow(cy,cm,d);
  const isHoliday=isHolidayDate(dstr);
  // 一周最多一個備班
  const daysSinceMon=(dw+6)%7;
  const weekStart=d-daysSinceMon;
  let weekBeiCount=countBeiDays(cy,cm,Math.max(1,weekStart),d-1,e2=>esch[e2]);
  if(weekStart<1){
    const py=cm===1?cy-1:cy,pm=cm===1?12:cm-1,pk=mkey(py,pm),pd=daysIn(py,pm);
    weekBeiCount+=countBeiDays(py,pm,pd+weekStart,pd,e2=>(data[pk]||{}).schedule?.[e2]);
  }
  const useBei=workers.length>=5 && !isBusyDay(cy,cm,d) && weekBeiCount===0;

  // 吧台候選：主技能為吧的人優先（如阿維），其次依 emps 順序
  const barSorted=[...emps].sort((a,b)=>{
    const ap=(empSkills[a]||[])[0]==='吧'?0:1;
    const bp=(empSkills[b]||[])[0]==='吧'?0:1;
    return ap-bp;
  });
  // 廚房：1 人即可
  for(const e of emps){ if(avail(e)&&hasSk(e,'廚')){ set(e,'廚'); break; } }
  // 吧台：假日／國定假日 2 人，平日 1 人
  const isWeekend=dw===0||dw===6;
  const barNeeded=(isWeekend||isHoliday)?2:1;
  let barN=0;
  for(const e of barSorted){
    if(barN>=barNeeded) break;
    if(avail(e)&&hasSk(e,'吧')){ set(e,'吧'); barN++; }
  }
  // 備班（5人以上，每天最多一人）
  if(useBei){
    for(const e of emps){ if(avail(e)&&hasSk(e,'備')){ set(e,'備'); break; } }
  }
  // 其餘都是外場
  workers.forEach(e=>{ if(avail(e)){ set(e,'外'); } });
}

async function autoSchedule(){
  // 排班規則依賴國定假日，須等 API 載入完成
  const y=cy, m=cm;
  const hols=await fetchYearHols(y);
  if(cy!==y||cm!==m) return;
  pubHols=hols.filter(h=>h.date.startsWith(`${y}-${pad2(m)}`));
  if(!confirm(`自動排班將填入 ${cy} 年 ${cm} 月 所有空白格，已手動填寫的班別不受影響（上次自動排班的結果會重新排），確定繼續？`)) return;
  const k=mkey(); ensureMonth(cy,cm);
  const md=data[k]; const days=daysIn(cy,cm);
  const MAX_CLOSED=getMaxClosed();

  // 重置公休日（排班結束後依分布重新決定）
  data[k].closedDays=[];

  // 清除上次自動排班填入的格子（仍與當時填入內容相同者），避免重跑時舊結果疊加而多休；手動填寫或改過的格子保留
  const lastAuto=md.autoCells||{};
  emps.forEach(e=>{
    Object.entries(lastAuto[e]||{}).forEach(([dstr,code])=>{ if(md.schedule[e][dstr]===code) delete md.schedule[e][dstr]; });
  });
  const beforeAuto={};
  emps.forEach(e=>{ beforeAuto[e]={...md.schedule[e]}; });

  // 自動排休的硬性限制：週五、週六、國定假日不排休；當天其餘在班人員須 4 人以上
  const isNoRestDay=d=>isBusyDay(cy,cm,d);

  // 每天確認休假名單（從已手動設定中建立）
  const offSet={};
  for(let d=1;d<=days;d++){
    offSet[d]=new Set();
    emps.forEach(e=>{ if(isRestShift(md.schedule[e][ds(cy,cm,d)])) offSet[d].add(e); });
  }

  // ── 公休日選取工具（預估與最終決定共用）：不可連休（含跨月）──
  const prevY=cm===1?cy-1:cy,prevM=cm===1?12:cm-1;
  const prevMd=data[mkey(prevY,prevM)]||{};
  const prevClosed=new Set((prevMd.closedDays)||[]);
  const prevDaysCount=daysIn(prevY,prevM);
  const nextMd=data[mkey(cm===12?cy+1:cy,cm===12?1:cm+1)]||{};
  const nextClosed1=(nextMd.closedDays||[]).includes(1);
  const isClosedBlocked=(d,picked)=>picked.some(x=>Math.abs(x-d)<=1)||(d===1&&prevClosed.has(prevDaysCount))||(d===days&&nextClosed1);
  const eligibleClosed=Array.from({length:days},(_,i)=>i+1).filter(d=>!isNoRestDay(d));
  // 公休日計入個人休假天數：先以「實際可排的公休天數」預估並扣除配額，公休日確定後再補足差額
  const closedEstimate=eligibleClosed.reduce((picked,d)=>(picked.length<MAX_CLOSED&&!isClosedBlocked(d,picked)?[...picked,d]:picked),[]).length;

  // ── Phase 1：分配休假日 ──
  const restQuota={}, restFloor={};
  emps.forEach(e=>{
    const manualRest=Object.values(md.schedule[e]).filter(v=>isRestShift(v)).length;
    const target=getRestTarget(md,e);
    if(target==null){ restQuota[e]=0; restFloor[e]=0; return; }
    restQuota[e]=Math.max(0,target-manualRest-closedEstimate);
    // 排不下時的保底天數：所有人員至少排足 REST_FLOOR 天（目標較低者以目標為準）
    restFloor[e]=Math.max(0,Math.min(target,REST_FLOOR)-manualRest-closedEstimate);
  });

  // 排休採「輪流一人一天」分配，人力吃緊時不足的天數（欠假）由大家平均分擔：
  // 每輪順序 = 前幾個月累計欠假多者優先，其次剩餘應休天數多者
  const priorOwed={};
  emps.forEach(e=>{ priorOwed[e]=Object.keys(data).filter(kk=>kk<k).reduce((s,kk)=>s+getOwedLeave(kk,e),0); });
  // 自動排班人力池：當天未休、且尚未手動填入班別者。手動填入的工作班別視為額外增援，不計入平日 4 人，也不影響排休判斷
  const autoPool=(d,except)=>emps.filter(w=>w!==except&&!offSet[d].has(w)&&!md.schedule[w][ds(cy,cm,d)]);
  const allocateRests=(quota,floor,banned)=>{
    const plan={};
    emps.forEach(e=>{
      if(!quota[e]) return;
      const candidates=[];
      for(let d=1;d<=days;d++){
        if(md.schedule[e][ds(cy,cm,d)]||isNoRestDay(d)||banned.has(d)) continue;
        candidates.push(d);
      }
      const needed=Math.min(quota[e], candidates.length);
      if(!needed) return;
      plan[e]={needed,assigned:0,candidates,dead:new Set()};
    });
    const roundOrder=()=>Object.keys(plan)
      .sort((a,b)=>priorOwed[b]-priorOwed[a]||(plan[b].needed-plan[b].assigned)-(plan[a].needed-plan[a].assigned)||emps.indexOf(a)-emps.indexOf(b));
    // 挑休假日：平日人力池最多的日子優先（讓平日趨近 4 人）；人數相同時離自己其他休假日越遠越好
    const pickDay=(e,ok)=>{
      const p=plan[e]; let best=0,bestSize=-1,bestDist=-1;
      const mine=[]; for(let x=1;x<=days;x++) if(offSet[x].has(e)) mine.push(x);
      p.candidates.forEach(d=>{
        if(p.dead.has(d)||md.schedule[e][ds(cy,cm,d)]) return;
        if(!ok(d)){ p.dead.add(d); return; } // 人力只會越排越少，不合格的日子之後也不會合格
        const size=autoPool(d,null).length;
        const dist=mine.reduce((m,x)=>Math.min(m,Math.abs(x-d)),days);
        if(size>bestSize||(size===bestSize&&dist>bestDist)){ best=d; bestSize=size; bestDist=dist; }
      });
      return best;
    };
    const giveRest=(e,d)=>{ md.schedule[e][ds(cy,cm,d)]='休'; offSet[d].add(e); plan[e].assigned++; };
    // 第一階段：職位搭配完整（廚、吧、外場）才排休，輪流一人一天
    for(let progress=true;progress;){
      progress=false;
      roundOrder().forEach(e=>{
        if(plan[e].assigned>=plan[e].needed) return;
        const d=pickDay(e,x=>canStaff(autoPool(x,e)));
        if(d){ giveRest(e,d); progress=true; }
      });
    }
    // 第二階段：仍低於保底天數者，放寬職位限制（仍須留 4 人以上）輪流補足；仍不足的部分計入欠假
    for(let progress=true;progress;){
      progress=false;
      roundOrder().filter(e=>plan[e].assigned<floor[e]).forEach(e=>{
        plan[e].dead.clear();
        const d=pickDay(e,x=>autoPool(x,e).length>=4);
        if(d){ giveRest(e,d); progress=true; }
      });
    }
  };
  allocateRests(restQuota,restFloor,new Set());


  // ── 確定公休日：取休假人數最多之日（上限 MAX_CLOSED 天），週五、週六、國定假日不可公休，且不可連休 ──
  const restCountAfter={};
  for(let d=1;d<=days;d++){
    restCountAfter[d]=emps.filter(e=>offSet[d].has(e)).length;
  }
  // 休假人數相同時，挑離已選公休日最遠者，讓公休日平均散布整個月（避免集中後中間出現過長連續工作）
  const newClosedDays=[];
  while(newClosedDays.length<MAX_CLOSED){
    let best=0,bestCnt=-1,bestDist=-1;
    eligibleClosed.forEach(d=>{
      if(isClosedBlocked(d,newClosedDays)) return;
      const dist=newClosedDays.reduce((m,x)=>Math.min(m,Math.abs(x-d)),days);
      if(restCountAfter[d]>bestCnt||(restCountAfter[d]===bestCnt&&dist>bestDist)){ best=d; bestCnt=restCountAfter[d]; bestDist=dist; }
    });
    if(!best) break;
    newClosedDays.push(best);
  }
  newClosedDays.sort((a,b)=>a-b);
  data[k].closedDays=newClosedDays;
  const closedSet=new Set(newClosedDays);

  const isOff=(e,d)=>offSet[d].has(e)||(closedSet.has(d)&&!md.schedule[e][ds(cy,cm,d)]);
  // ── Phase 1.5：防止連續工作 7 天（公休日確定後再檢查，公休日視為休息，避免多補休）──
  const streakViolations=[];
  emps.forEach(e=>{
    let initStreak=0;
    for(let pd=prevDaysCount;pd>=1;pd--){
      const psh=prevClosed.has(pd)?'休':getCell(prevMd,e,ds(prevY,prevM,pd));
      if(!psh||isRestShift(psh)) break;
      initStreak++; if(initStreak>=6) break;
    }
    let streak=initStreak;
    for(let d=1;d<=days;d++){
      if(isOff(e,d)){streak=0;continue;}
      streak++;
      if(streak<7) continue;
      // 連續第 7 天：由當天往前回溯找空白格補休（不排週五六與國定假日、須留 4 人以上；優先職位搭配也滿足，找不到再放寬職位）
      let placed=0;
      for(const strict of [true,false]){
        for(let x=d;x>=d-6&&x>=1;x--){
          if(md.schedule[e][ds(cy,cm,x)]||isNoRestDay(x)) continue;
          const rest=autoPool(x,e);
          if(strict?!canStaff(rest):rest.length<4) continue;
          placed=x; break;
        }
        if(placed) break;
      }
      if(placed){
        md.schedule[e][ds(cy,cm,placed)]='休'; offSet[placed].add(e);
        streak=d-placed;
      } else {
        streakViolations.push(`${e} ${cm}/${d}`);
        streak=0;
      }
    }
  });

  // 公休日計入個人休假天數：公休日確定後，實際休假（含公休日）仍不足應休天數者，於其他日補排
  const topQuota={}, topFloor={};
  emps.forEach(e=>{
    const target=getRestTarget(md,e);
    if(target==null){ topQuota[e]=0; topFloor[e]=0; return; }
    const have=monthRestCount(k,e);
    topQuota[e]=Math.max(0,target-have);
    topFloor[e]=Math.max(0,Math.min(target,REST_FLOOR)-have);
  });
  allocateRests(topQuota,topFloor,closedSet);


  // ── Phase 2：填入班別 ──
  for(let d=1;d<=days;d++){
    if(closedSet.has(d)) continue;
    const workers=emps.filter(e=>!offSet[d].has(e));
    const eSchMap={};
    workers.forEach(e=>{ eSchMap[e]=md.schedule[e]; });
    assignDayShifts(workers, eSchMap, d);
  }

  data[k].autoRan=true;
  data[k].autoCells={};
  emps.forEach(e=>{
    Object.entries(md.schedule[e]).forEach(([dstr,code])=>{
      if(code&&!beforeAuto[e][dstr]) (data[k].autoCells[e]=data[k].autoCells[e]||{})[dstr]=code;
    });
  });
  save(); renderAll();
  const msgs=[];
  const owedList=emps.map(e=>[e,getOwedLeave(k,e)]).filter(([,n])=>n>0);
  if(owedList.length) msgs.push('以下人員應休天數排不下，不足天數計入欠假：\n'+owedList.map(([e,n])=>`${e} 欠 ${n} 天（累計 ${getOwedTotal(e)} 天）`).join('\n'));
  if(streakViolations.length) msgs.push('以下日期無法避免連續工作 7 天（該段沒有可補休的日子：週五六、國定假日不排休，其餘已手動填寫或補休會使當天不足 4 人），請手動調整：\n'+streakViolations.join('\n'));
  if(msgs.length) alert(msgs.join('\n\n'));
}

// ══════════════════════════════════════════
//  SHIFT TYPE MODAL
// ══════════════════════════════════════════
function openShiftTypeModal(){
  renderBuiltinShiftList();
  renderCustomShiftList();
  openModal('shiftTypeModal');
}
function closeShiftTypeModal(){ closeModal('shiftTypeModal'); }

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
function refreshShiftTypeUI(){
  updateSMAP(); save();
  renderBuiltinShiftList(); renderCustomShiftList(); renderLegend(); renderTable(); renderStats();
}
function hideBuiltin(code){ hiddenBuiltins.add(code); refreshShiftTypeUI(); }
function restoreBuiltin(code){ hiddenBuiltins.delete(code); refreshShiftTypeUI(); }
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
  refreshShiftTypeUI();
  document.getElementById('csCode').value=''; clearDraft('csCode');
  document.getElementById('csLabel').value=''; clearDraft('csLabel');
}
function removeCustomShift(i){
  if(!confirm(`確定刪除自訂班別「${customShifts[i].label}」？已排入的班表代碼將保留但不顯示顏色。`)) return;
  const code=customShifts[i].code;
  Object.keys(empSkills).forEach(e=>{ const idx=empSkills[e].indexOf(code); if(idx>=0) empSkills[e].splice(idx,1); });
  customShifts.splice(i,1);
  refreshShiftTypeUI();
}

// ══════════════════════════════════════════
//  BULK LEAVE
// ══════════════════════════════════════════
let blSelectedDays = new Set();

function openBulkLeaveModal(){
  blSelectedDays=new Set();
  const sel=document.getElementById('blEmp');
  sel.innerHTML='<option value="__all__">— 全部員工 —</option>'+emps.map(e=>`<option value="${e}">${e}</option>`).join('');
  document.getElementById('blOverwrite').checked=false;
  renderBlCalGrid();
  openModal('bulkLeaveModal');
}
function closeBulkLeaveModal(){ closeModal('bulkLeaveModal'); }

function renderBlCalGrid(){
  const days=daysIn(cy,cm); const firstDow=dow(cy,cm,1);
  let h='<div class="bl-cal-hdr">'+WDS.map(w=>`<div>${w}</div>`).join('')+'</div><div class="bl-cal-body">';
  for(let i=0;i<firstDow;i++) h+='<div></div>';
  for(let d=1;d<=days;d++){
    const dw=dow(cy,cm,d); const sel=blSelectedDays.has(d);
    let cls='bl-day'+(dw===0?' bl-sun':dw===6?' bl-sat':'')+(sel?' bl-sel':'');
    h+=`<div class="${cls}" onclick="blToggleDay(${d})">${d}</div>`;
  }
  h+='</div>';
  document.getElementById('blCalGrid').innerHTML=h;
}

function blToggleDay(d){
  blSelectedDays.has(d)?blSelectedDays.delete(d):blSelectedDays.add(d);
  renderBlCalGrid();
}

function applyBulkLeave(){
  const empVal=document.getElementById('blEmp').value;
  const overwrite=document.getElementById('blOverwrite').checked;
  if(!blSelectedDays.size){ alert('請點選要請假的日期'); return; }
  const targetEmps=empVal==='__all__'?emps:[empVal];
  ensureMonth(cy,cm);
  const k=mkey(); const md=data[k];
  let count=0;
  blSelectedDays.forEach(day=>{
    const dstr=ds(cy,cm,day);
    targetEmps.forEach(emp=>{
      if(!md.schedule[emp]) md.schedule[emp]={};
      if(!md.schedule[emp][dstr]||overwrite){ md.schedule[emp][dstr]='休'; count++; }
    });
    syncClosedDay(k,dstr);
  });
  save(); renderAll();
  alert(`已標記 ${count} 筆請假`);
  closeBulkLeaveModal();
}

// ══════════════════════════════════════════
//  CLOSE ON OUTSIDE CLICK / ESC
// ══════════════════════════════════════════
// 新增視窗時只需加在這裡，點外側與 Esc 會一併生效
const MODALS=[
  ['shiftModal',closeShiftModal],
  ['empModal',closeEmpModal],
  ['shiftTypeModal',closeShiftTypeModal],
  ['staffWarnModal',closeStaffWarnModal],
  ['bulkLeaveModal',closeBulkLeaveModal],
];
MODALS.forEach(([id,fn])=>{
  document.getElementById(id).addEventListener('click',e=>{ if(e.target===e.currentTarget) fn(); });
});
document.addEventListener('keydown',e=>{ if(e.key==='Escape') MODALS.forEach(([,fn])=>fn()); });

// ══════════════════════════════════════════
//  PRINT：不管內容多高，列印前用 JS 量測後整體縮放，強制塞進同一頁
//  （CSS 的 break-inside/page-break 只能避免切斷，沒辦法保證塞得下；
//   這裡改用「量高度→算縮放比例→transform:scale()」的方式硬擠進一頁）
// ══════════════════════════════════════════
function fitPrintToOnePage(){
  const outer=document.getElementById('printFitOuter');
  const inner=document.getElementById('printFitInner');
  if(!outer||!inner) return;
  inner.style.transform='none';
  inner.style.width='';
  outer.style.height='';
  const mmToPx=96/25.4;
  const pageW=(297-16)*mmToPx; // @page A4 landscape，扣掉左右各 8mm margin
  const pageH=(210-16)*mmToPx; // 扣掉上下各 8mm margin
  const contentW=inner.scrollWidth;
  const contentH=inner.scrollHeight;
  if(!contentW||!contentH) return;
  const scale=Math.min(1, pageW/contentW, pageH/contentH);
  if(scale<1){
    inner.style.transformOrigin='top left';
    inner.style.transform=`scale(${scale})`;
    inner.style.width=(100/scale)+'%';
    outer.style.height=(contentH*scale)+'px';
  }
}
function resetPrintFit(){
  const outer=document.getElementById('printFitOuter');
  const inner=document.getElementById('printFitInner');
  if(!outer||!inner) return;
  inner.style.transform='';
  inner.style.width='';
  outer.style.height='';
}
window.addEventListener('beforeprint', fitPrintToOnePage);
window.addEventListener('afterprint', resetPrintFit);

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

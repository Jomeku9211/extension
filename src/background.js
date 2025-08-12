// Lifecycle logs to confirm registration
self.addEventListener('install', () => { try { console.log('[SW] install'); } catch(e) {} });
self.addEventListener('activate', () => { try { console.log('[SW] activate'); } catch(e) {} });

// Clean, consolidated MV3 background: constants, state, helpers, runtime messaging,
// process flow (claim -> verify -> open -> wait 10s -> post -> dwell 10–15s -> close -> finalize -> schedule)

// Airtable config: fixed and constant
const AIRTABLE_API_KEY = 'patFClficxpGIUnJF.be5a51a7e3fabe7337cd2cb13dc3f10234fc52d8a1f60e012eb68be7b2fcc982';
const AIRTABLE_BASE_ID = 'appD9VxZrOhiQY9VB';
const AIRTABLE_TABLE_ID = 'tblyhMPmCt87ORo3t';
const AIRTABLE_VIEW_ID = 'viwiRzf62qaMKGQoG';
// Per-account "today" views
const AIRTABLE_TODAY_VIEW_ID_D = 'viwjzxpzCC24wtkfc';
const AIRTABLE_TODAY_VIEW_ID_A = 'viwX2GldbNBTv1ho3';
const AIRTABLE_DUPLICATE_VIEW_ID = 'viwhyoCkHret6DqWe';
let CONFIG = { AIRTABLE_API_KEY, AIRTABLE_BASE_ID, AIRTABLE_TABLE_ID, AIRTABLE_VIEW_ID };

let isRunning = false;
let nextDelay = null;
let nextFireTime = null;
let startedAt = null;
let runStats = { processed: 0, successes: 0, failures: 0, lastRun: null, lastError: null };
let currentAccount = 'A';
let instanceId = null;
let isProcessingTick = false; // one-at-a-time guard
let activeTabId = null; // currently opened LI tab
let currentRecordId = null; // currently claimed Airtable record
let todayCountA = 0;
let todayCountD = 0;
let lastCountAtA = 0;
let lastCountAtD = 0;
const TODAY_COUNT_TTL_MS = 2 * 60 * 1000; // 2 minutes
let todayPostsA = [];
let todayPostsD = [];
let lastPostsAtA = 0;
let lastPostsAtD = 0;
let duplicateUrls = new Set();
let duplicateCommentIds = new Set();
let dupLastRefreshed = 0;
const DUP_TTL_MS = 10 * 60 * 1000;

function normalizeUrl(u) {
    try { const url = new URL(u); let path = url.pathname || '/'; if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1); return `${url.origin}${path}`; } catch { return u; }
}
function safeStringify(obj){ try{ const seen=new WeakSet(); return JSON.stringify(obj,(k,v)=>{ if(v instanceof Error) return {name:v.name,message:v.message,stack:v.stack}; if(typeof v==='object'&&v!==null){ if(seen.has(v)) return '[Circular]'; seen.add(v);} return v;}); }catch{ return String(obj);} }
function formatErr(e,fb='Unexpected error'){ if(!e) return fb; if(typeof e==='string') return e; if(typeof Response!=='undefined'&&e instanceof Response) return `HTTP ${e.status} ${e.statusText}`; if(e&&typeof e.message==='string') return e.message; const s=safeStringify(e); return s&&s!=='{}"'?s:String(e);} 
function formatAirtable(json,fb='Airtable error'){ if(!json) return fb; const err=json.error; if(!err) return fb; if(typeof err==='string') return err; if(err.message) return err.message; if(err.type) return err.type; try{return safeStringify(err);}catch{return String(err);} }

async function fetchTodayCount(acct){ try{ let count=0, offset; do{ const params=new URLSearchParams(); const viewId=acct==='D'?AIRTABLE_TODAY_VIEW_ID_D:AIRTABLE_TODAY_VIEW_ID_A; params.set('view',viewId); params.set('pageSize','100'); if(offset) params.set('offset',offset); const url=`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`; const res=await fetch(url,{ headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}` }}); const data=await res.json(); if(!res.ok){ const msg=formatAirtable(data,res.statusText); runStats.lastError=`Airtable Today view error: ${msg}`; chrome.storage.local.set({ runStats }); break; } if(data&&Array.isArray(data.records)) count+=data.records.length; offset=data&&data.offset; } while(offset); if(acct==='D'){ todayCountD=count; lastCountAtD=Date.now(); } else { todayCountA=count; lastCountAtA=Date.now(); } chrome.storage.local.set({ todayCountA, todayCountD, lastCountAtA, lastCountAtD }); return count; } catch { return acct==='D'?todayCountD:todayCountA; } }
function refreshTodayCount(acct){ const last=acct==='D'?lastCountAtD:lastCountAtA; if(Date.now()-last<10*1000) return; fetchTodayCount(acct); }

// Restore state on boot
chrome.storage.local.get(['isRunning','nextFireTime','runStats','startedAt','todayCountA','todayCountD','lastCountAtA','lastCountAtD','duplicateUrls','duplicateCommentIds','dupLastRefreshed','selectedAccount','instanceId'], (items)=>{
    isRunning=!!items.isRunning; nextFireTime=items.nextFireTime||null; runStats=items.runStats||runStats; startedAt=items.startedAt||null; currentAccount=items.selectedAccount==='D'?'D':'A'; instanceId=items.instanceId||`${Date.now()}_${Math.random().toString(36).slice(2,10)}`; chrome.storage.local.set({ instanceId });
    if(!isRunning){ runStats={ processed:0, successes:0, failures:0, lastRun:null, lastError:null }; startedAt=null; chrome.storage.local.set({ runStats, startedAt }); }
    todayCountA=typeof items.todayCountA==='number'?items.todayCountA:0; todayCountD=typeof items.todayCountD==='number'?items.todayCountD:0; lastCountAtA=typeof items.lastCountAtA==='number'?items.lastCountAtA:0; lastCountAtD=typeof items.lastCountAtD==='number'?items.lastCountAtD:0;
    if(Array.isArray(items.duplicateUrls)) duplicateUrls=new Set(items.duplicateUrls); if(Array.isArray(items.duplicateCommentIds)) duplicateCommentIds=new Set(items.duplicateCommentIds); dupLastRefreshed=typeof items.dupLastRefreshed==='number'?items.dupLastRefreshed:0;
    if(isRunning){ if(nextFireTime&&Date.now()<nextFireTime){ const delayMs=Math.max(0,nextFireTime-Date.now()); chrome.alarms.create('autoCommentTick',{ when: Date.now()+delayMs }); } else { const soon=1000; nextFireTime=Date.now()+soon; chrome.storage.local.set({ nextFireTime }); chrome.alarms.create('autoCommentTick',{ when: Date.now()+soon }); } }
    refreshTodayCount('A'); refreshTodayCount('D');
});

function getRandomDelay(){ const min=7*60*1000, extra=3*60*1000; return min+Math.floor(Math.random()*extra); }

// Messaging from popup/content
chrome.runtime.onMessage.addListener((request, sender, sendResponse)=>{
    if(!request||!request.action) return;
    if(request.action==='start'){
        const acct=request.account==='D'?'D':'A'; currentAccount=acct;
        acquireAccountLock(acct).then((ok)=>{
            if(!ok){ sendResponse({ ok:false, error:`${acct} is active on another browser` }); try{ chrome.runtime.sendMessage({ action:'statusUpdated' }); }catch{} return; }
            isRunning=true; startedAt=Date.now(); runStats.lastError=null; chrome.storage.local.set({ isRunning, startedAt, runStats, selectedAccount: acct });
            const initial=2000; nextFireTime=Date.now()+initial; chrome.storage.local.set({ nextFireTime }); chrome.alarms.clear('autoCommentTick',()=>{ chrome.alarms.create('autoCommentTick',{ when: nextFireTime }); });
            sendResponse({ ok:true }); try{ chrome.runtime.sendMessage({ action:'statusUpdated' }); }catch{}
        }).catch((e)=>sendResponse({ ok:false, error: formatErr(e) }));
        return true;
    }
    if(request.action==='stop'){
        isRunning=false; nextFireTime=null; startedAt=null; chrome.alarms.clear('autoCommentTick'); chrome.storage.local.set({ isRunning, nextFireTime, startedAt });
        if(activeTabId){ try{ chrome.tabs.remove(activeTabId,()=>void chrome.runtime.lastError);}catch{} } activeTabId=null; currentRecordId=null; releaseAccountLock(currentAccount).catch(()=>{});
        try{ chrome.runtime.sendMessage({ action:'statusUpdated' }); }catch{}
        sendResponse({ ok:true }); return true;
    }
    if(request.action==='getStatus'){
        const acct=(request.account==='D'||request.account==='A')?request.account:currentAccount; if(request.force) refreshTodayCount(acct); const today=acct==='D'?todayCountD:todayCountA; sendResponse({ account:acct, isRunning, nextFireTime, startedAt, runStats, todayCount: today }); return true;
    }
    if(request.action==='checkLock'){ const acct=(request.account==='D'||request.account==='A')?request.account:currentAccount; checkAccountLock(acct).then((lock)=>sendResponse(lock)).catch((e)=>sendResponse({ isLockedByOther:false, heldBySelf:false, error: formatErr(e) })); return true; }
    if(request.action==='tickNow'){ if(!isRunning){ sendResponse({ ok:false, error:'Not running' }); return true; } processRecords().then(()=>sendResponse({ ok:true })).catch(e=>sendResponse({ ok:false, error: formatErr(e) })); return true; }
    if(request.action==='getTodayPosts'){ const acct=(request.account==='D'||request.account==='A')?request.account:currentAccount; getTodayPosts(acct).then((posts)=>sendResponse({ posts })).catch((e)=>sendResponse({ posts:[], error: formatErr(e) })); return true; }
});

function scheduleNext(delayMs){ if(!isRunning){ isProcessingTick=false; return; } const when=Date.now()+delayMs; nextFireTime=when; chrome.storage.local.set({ nextFireTime }); chrome.alarms.clear('autoCommentTick',()=>{ chrome.alarms.create('autoCommentTick',{ when }); try{ chrome.runtime.sendMessage({ action:'statusUpdated' }); }catch{} isProcessingTick=false; }); }

async function processRecords(){
    if(!isRunning) return; if(isProcessingTick) return; isProcessingTick=true;
    let scheduled = false;
    try {
    console.log('[SW] processRecords tick, account:', currentAccount);
    const claim=await claimNextRecord(currentAccount);
    if(!claim||claim.status==='no-record'){
        runStats.lastRun=Date.now(); runStats.lastError=`No records in Airtable (view: ${AIRTABLE_VIEW_ID||'default'})`; isRunning=false; nextFireTime=null; startedAt=null; chrome.alarms.clear('autoCommentTick'); chrome.storage.local.set({ isRunning, nextFireTime, startedAt, runStats }); try{ chrome.runtime.sendMessage({ action:'statusUpdated' }); }catch{} releaseAccountLock(currentAccount).catch(()=>{}); isProcessingTick=false; return;
    }
    if(claim.status!=='ok'){ runStats.lastRun=Date.now(); if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); scheduled = true; try{ chrome.runtime.sendMessage({ action:'statusUpdated' }); }catch{} } else { chrome.storage.local.set({ runStats }); } return; }
    const record=claim.record;
    if(currentRecordId && currentRecordId===record.id){ runStats.lastRun=Date.now(); if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); scheduled = true; } else { chrome.storage.local.set({ runStats }); } return; }

    const owns=await verifyOwnership(record.id,currentAccount);
    if(!owns){ runStats.lastRun=Date.now(); if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); scheduled = true; } else { chrome.storage.local.set({ runStats }); } return; }

    const fields=record.fields||{}; const postUrl=fields['Post URL']; await refreshDuplicatesIfStale(); if(isDuplicate(postUrl)){ await finalizeRecord(record.id,currentAccount,null); runStats.processed+=1; runStats.lastRun=Date.now(); runStats.lastError=null; if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); scheduled = true; } else { chrome.storage.local.set({ runStats }); } return; }
    const commentText=fields['Generated Comment']; if(!postUrl||!commentText){ const reason=`Airtable record missing required field(s): ${!postUrl&&!commentText?'Post URL and Generated Comment':(!postUrl?'Post URL':'Generated Comment')}`; try{ await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${record.id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'In Progress': false, 'Picked By': '' } }) }); }catch{} runStats.failures+=1; runStats.lastRun=Date.now(); runStats.lastError=reason; chrome.storage.local.set({ runStats }); if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); scheduled = true; } return; }

    currentRecordId=record.id;
    chrome.tabs.create({ url: postUrl, active: true }, (tab)=>{
        if(!tab||!tab.id){
            // Could not open a tab; schedule next and clear processing flag
            currentRecordId=null;
            runStats.failures+=1;
            runStats.lastRun=Date.now();
            runStats.lastError='Failed to open LinkedIn tab';
            chrome.storage.local.set({ runStats });
            if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); }
            else { isProcessingTick=false; }
            return;
        }
        activeTabId=tab.id;
        // Page load watchdog in case 'complete' never fires
        let pageLoadTimer = setTimeout(()=>{
            try{ chrome.tabs.onUpdated.removeListener(listener); }catch{}
            try{ chrome.tabs.remove(tab.id,()=>void chrome.runtime.lastError);}catch{}
            activeTabId=null; currentRecordId=null;
            runStats.failures+=1; runStats.lastRun=Date.now(); runStats.lastError='Page load timed out';
            chrome.storage.local.set({ runStats });
            if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); }
            else { isProcessingTick=false; }
        }, 45000);

        function listener(tabId, changeInfo){
            if(tabId===tab.id && changeInfo.status==='complete'){
                chrome.tabs.onUpdated.removeListener(listener);
                if(pageLoadTimer){ clearTimeout(pageLoadTimer); pageLoadTimer=null; }
                setTimeout(()=>{
                    if(!isRunning){ try{ chrome.tabs.remove(tab.id,()=>void chrome.runtime.lastError);}catch{} activeTabId=null; currentRecordId=null; return; }
                    let completed=false; let watchdogTimer=null;
                    const scheduleFailure=(reason)=>{ runStats.failures+=1; runStats.lastRun=Date.now(); runStats.lastError=reason||'Posting failed'; chrome.storage.local.set({ runStats }); if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); } else { chrome.storage.local.set({ runStats }); } };
                    const cleanupAndFail=(reason)=>{ if(watchdogTimer){ clearTimeout(watchdogTimer); watchdogTimer=null; } try{ chrome.tabs.remove(tab.id,()=>void chrome.runtime.lastError);}catch{} activeTabId=null; currentRecordId=null; scheduleFailure(reason); };
                    const trySend=()=> chrome.tabs.sendMessage(tab.id,{ action:'postComment', commentText, postUrl },()=>{
                        if(chrome.runtime.lastError){ const errMsg=chrome.runtime.lastError.message||''; if(errMsg.includes('No tab with id')){ scheduleFailure('Tab closed before posting'); return; }
                            try{ chrome.scripting.executeScript({ target:{ tabId: tab.id }, files:['src/content.js'] },()=>{ if(chrome.runtime.lastError){ const injMsg=chrome.runtime.lastError.message||'unknown injection error'; if(injMsg.includes('No tab with id')){ scheduleFailure('Tab closed before posting'); return; } cleanupAndFail(`Content script injection failed: ${injMsg}`); return; } chrome.tabs.sendMessage(tab.id,{ action:'postComment', commentText, postUrl }); }); }catch(e){ cleanupAndFail(`Content script injection error: ${formatErr(e)}`); }
                        }
                    });
                    trySend();

                    const onResponse=function(message, senderInfo){
                        if(!isRunning){ chrome.runtime.onMessage.removeListener(onResponse); try{ chrome.tabs.remove(tab.id,()=>void chrome.runtime.lastError);}catch{} return; }
                        if(message && message.action==='commentPosted' && senderInfo.tab && senderInfo.tab.id===tab.id){
                            chrome.runtime.onMessage.removeListener(onResponse); completed=true; if(watchdogTimer){ clearTimeout(watchdogTimer); watchdogTimer=null; }
                            if(message.postUrl) duplicateUrls.add(normalizeUrl(message.postUrl)); if(message.commentId) duplicateCommentIds.add(message.commentId);
                            chrome.storage.local.set({ duplicateUrls: Array.from(duplicateUrls), duplicateCommentIds: Array.from(duplicateCommentIds) });
                const dwellMs=10000+Math.floor(Math.random()*5000);
                            setTimeout(()=>{
                                if(!isRunning){ try{ chrome.tabs.remove(tab.id,()=>void chrome.runtime.lastError);}catch{} activeTabId=null; currentRecordId=null; return; }
                                try{ chrome.tabs.remove(tab.id,()=>void chrome.runtime.lastError);}catch{}
                                activeTabId=null;
                                finalizeRecord(record.id,currentAccount,null).then(()=>{
                                    currentRecordId=null; runStats.processed+=1; runStats.successes+=1; runStats.lastRun=Date.now(); runStats.lastError=null;
                                    if(currentAccount==='D'){ todayCountD+=1; lastCountAtD=Date.now(); } else { todayCountA+=1; lastCountAtA=Date.now(); }
                                    chrome.storage.local.set({ todayCountA, todayCountD, lastCountAtA, lastCountAtD }); refreshTodayCount(currentAccount);
                    if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); scheduled = true; try{ chrome.runtime.sendMessage({ action:'statusUpdated' }); }catch{} }
                                }).catch((e)=>{
                                    currentRecordId=null; runStats.failures+=1; runStats.lastRun=Date.now(); runStats.lastError=`Finalize error: ${formatErr(e)}`; chrome.storage.local.set({ runStats }); if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); try{ chrome.runtime.sendMessage({ action:'statusUpdated' }); }catch{} }
                                });
                            }, dwellMs);
                        }
                    };
                    chrome.runtime.onMessage.addListener(onResponse);
                    watchdogTimer=setTimeout(()=>{ chrome.runtime.onMessage.removeListener(onResponse); if(!completed) cleanupAndFail('Timed out waiting for comment to post'); },60000);
                }, 10000);
            }
        }
        chrome.tabs.onUpdated.addListener(listener);
    });
    } catch (err) {
        console.error('[SW] processRecords error:', err);
        runStats.failures+=1; runStats.lastRun=Date.now(); runStats.lastError = formatErr(err);
        chrome.storage.local.set({ runStats });
        if(isRunning){ nextDelay=getRandomDelay(); scheduleNext(nextDelay); scheduled = true; }
    } finally {
        if (!scheduled) {
            // Safety: don’t leave the tick locked
            isProcessingTick = false;
        }
    }
}

async function getNextPendingRecord(){ const { AIRTABLE_API_KEY } = CONFIG||{}; async function fetchWithFormula(formula){ const params=new URLSearchParams(); if(AIRTABLE_VIEW_ID) params.set('view',AIRTABLE_VIEW_ID); params.set('pageSize','1'); if(formula) params.set('filterByFormula',formula); const url=`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`; const res=await fetch(url,{ headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}` } }); const json=await res.json(); if(!res.ok){ const msg=formatAirtable(json,`${res.status} ${res.statusText}`); console.warn('Airtable query failed:',msg);} return { ok:res.ok, json, url, formula }; }
    try{ const excludeLock="AND(NOT({Post URL}='LOCK_A'), NOT({Post URL}='LOCK_D'))"; let { ok, json }=await fetchWithFormula(`AND(NOT({Comment Done}), NOT({In Progress}), ${excludeLock})`); if(!ok||!json.records){ const acct=currentAccount||'A'; const excludePicked=`OR(LEN({Picked By})=0, NOT({Picked By}='${acct}'))`; ({ ok, json }=await fetchWithFormula(`AND(NOT({Comment Done}), ${excludeLock}, ${excludePicked})`)); if(ok&&json&&json.records){ runStats.lastError=null; chrome.storage.local.set({ runStats }); } else if(!ok){ const msg=formatAirtable(json,'Airtable list error'); runStats.lastError=`Airtable list error: ${msg}`; chrome.storage.local.set({ runStats }); } } if(!json||!json.records) return null; return json.records.length>0?json.records[0]:null; } catch(e){ const msg=formatErr(e); runStats.lastError=`Airtable list error: ${msg}`; chrome.storage.local.set({ runStats }); return null; }
}

async function claimNextRecord(acct){ const rec=await getNextPendingRecord(); if(!rec) return { status:'no-record', record:null }; const id=rec.id; try{ let res=await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'In Progress': true, 'Picked By': acct } }) }); let j=await res.json().catch(()=>({})); if(!res.ok){ res=await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'Picked By': acct } }) }); j=await res.json().catch(()=>({})); if(!res.ok){ const msg=`Claim failed: ${formatAirtable(j, res.statusText)}`; runStats.lastError=msg; chrome.storage.local.set({ runStats }); return { status:'claim-failed', record:null }; } } return { status:'ok', record: rec }; } catch(e){ const msg=formatErr(e); runStats.lastError=msg; chrome.storage.local.set({ runStats }); return { status:'claim-error', record:null }; }

async function finalizeRecord(recordId, acct, tabId){ const commenter=acct==='D'?'Dheeraj':'Abhilasha'; const variants=[ { 'Comment Done': true, 'In Progress': false, 'Picked By': acct, 'Comment By': commenter }, { 'Comment Done': true, 'Picked By': acct, 'Comment By': commenter }, { 'Comment Done': true, 'Picked By': acct }, { 'Comment Done': true } ]; let ok=false, lastErr=null; for(const fields of variants){ try{ const res=await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields }) }); if(res.ok){ ok=true; break; } const j=await res.json().catch(()=>({})); lastErr=formatAirtable(j,res.statusText); } catch(e){ lastErr=formatErr(e); } } if(!ok&&lastErr){ runStats.lastError=`Finalize failed: ${lastErr}`; chrome.storage.local.set({ runStats }); } if(tabId){ chrome.tabs.remove(tabId,()=>void chrome.runtime.lastError); } }

async function verifyOwnership(recordId, acct){ try{ const url=`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${recordId}`; const res=await fetch(url,{ headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}` } }); const data=await res.json(); const fields=data&&data.fields?data.fields:{}; if(Object.prototype.hasOwnProperty.call(fields,'In Progress')){ return fields['In Progress']===true && fields['Picked By']===acct; } return fields['Picked By']===acct; } catch{ return false; } }

chrome.alarms.onAlarm.addListener((alarm)=>{ if(alarm&&alarm.name==='autoCommentTick'){ if(!isRunning) return; if(isProcessingTick) return; processRecords().catch(err=>{ runStats.failures+=1; runStats.lastRun=Date.now(); runStats.lastError=formatErr(err); chrome.storage.local.set({ runStats }); nextDelay=getRandomDelay(); scheduleNext(nextDelay); }); heartbeatAccountLock(currentAccount).catch(()=>{}); } });

try{ chrome.tabs.onRemoved.addListener((tabId)=>{ if(tabId===activeTabId) activeTabId=null; }); }catch{}

async function fetchDuplicateUrlsFromAirtable(){ try{ let urls=new Set(), offset; do{ const params=new URLSearchParams(); params.set('view',AIRTABLE_DUPLICATE_VIEW_ID); params.set('pageSize','100'); if(offset) params.set('offset',offset); const url=`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`; const res=await fetch(url,{ headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}` } }); const data=await res.json(); if(!res.ok){ const msg=formatAirtable(data,res.statusText); runStats.lastError=`Airtable duplicate view error: ${msg}`; chrome.storage.local.set({ runStats }); break; } if(data&&Array.isArray(data.records)){ for(const r of data.records){ const u=r.fields&&r.fields['Post URL']; if(u) urls.add(normalizeUrl(u)); } } offset=data&&data.offset; } while(offset); return urls; } catch(e){ const msg=formatErr(e); runStats.lastError=`Airtable duplicate view error: ${msg}`; chrome.storage.local.set({ runStats }); return null; } }
async function refreshDuplicatesIfStale(){ const now=Date.now(); if(now-dupLastRefreshed<DUP_TTL_MS) return; const urls=await fetchDuplicateUrlsFromAirtable(); if(urls){ for(const u of urls) duplicateUrls.add(normalizeUrl(u)); dupLastRefreshed=now; chrome.storage.local.set({ duplicateUrls: Array.from(duplicateUrls), dupLastRefreshed }); } }
function isDuplicate(postUrl){ if(!postUrl) return false; return duplicateUrls.has(normalizeUrl(postUrl)); }

async function fetchTodayPosts(acct){ try{ const posts=[]; let offset; const viewId=acct==='D'?AIRTABLE_TODAY_VIEW_ID_D:AIRTABLE_TODAY_VIEW_ID_A; do{ const params=new URLSearchParams(); params.set('view',viewId); params.set('pageSize','100'); if(offset) params.set('offset',offset); const url=`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${params.toString()}`; const res=await fetch(url,{ headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}` } }); const data=await res.json(); if(!res.ok){ const msg=formatAirtable(data,res.statusText); runStats.lastError=`Airtable Today view error: ${msg}`; chrome.storage.local.set({ runStats }); break; } if(data&&Array.isArray(data.records)){ for(const r of data.records){ const f=r.fields||{}; const urlField=f['Post URL']; if(urlField) posts.push({ id:r.id, url:urlField, by:f['Comment By']||null }); } } offset=data&&data.offset; } while(offset); return posts; } catch(e){ const msg=formatErr(e); runStats.lastError=`Airtable Today view error: ${msg}`; chrome.storage.local.set({ runStats }); return []; } }
async function getTodayPosts(acct){ const now=Date.now(); const last=acct==='D'?lastPostsAtD:lastPostsAtA; const cached=acct==='D'?todayPostsD:todayPostsA; if(now-last<TODAY_COUNT_TTL_MS && Array.isArray(cached)) return cached; const posts=await fetchTodayPosts(acct); if(acct==='D'){ todayPostsD=posts; lastPostsAtD=now; } else { todayPostsA=posts; lastPostsAtA=now; } chrome.storage.local.set({ todayPostsA, todayPostsD, lastPostsAtA, lastPostsAtD }); return posts; }

function lockKeyFor(acct){ return acct==='D'?'LOCK_D':'LOCK_A'; }
async function getOrCreateLockRecord(acct){ const key=lockKeyFor(acct); const findParams=new URLSearchParams(); findParams.set('filterByFormula',`{Post URL}='${key}'`); findParams.set('pageSize','1'); const findUrl=`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}?${findParams.toString()}`; const headers={ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }; const res=await fetch(findUrl,{ headers }); const data=await res.json(); if(data&&Array.isArray(data.records)&&data.records.length>0) return data.records[0]; const createUrl=`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}`; let cres=await fetch(createUrl,{ method:'POST', headers, body: JSON.stringify({ records:[{ fields:{ 'Post URL': key, 'Picked By': '' } }] }) }); if(!cres.ok){ cres=await fetch(createUrl,{ method:'POST', headers, body: JSON.stringify({ records:[{ fields:{ 'Post URL': key, 'In Progress': false, 'Picked By': '' } }] }) }); } const cjson=await cres.json().catch(()=>({})); return cjson && Array.isArray(cjson.records) ? cjson.records[0] : null; }
function parsePickedBy(pickedBy){ if(!pickedBy||typeof pickedBy!=='string') return { holder:'', ts:0 }; const [holder, tsStr]=pickedBy.split(':'); const ts=parseInt(tsStr,10); return { holder: holder||'', ts: Number.isFinite(ts)?ts:0 }; }
async function acquireAccountLock(acct){ try{ const rec=await getOrCreateLockRecord(acct); if(!rec) return false; const fields=rec.fields||{}; const active=!!fields['In Progress']; const { holder, ts }=parsePickedBy(fields['Picked By']); const now=Date.now(); const stale=!ts||now-ts>2*60*1000; if(active && holder!==instanceId && !stale) return false; const newPickedBy=`${instanceId}:${Date.now()}`; let res=await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'In Progress': true, 'Picked By': newPickedBy } }) }); if(!res.ok){ res=await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'Picked By': newPickedBy } }) }); if(!res.ok){ const j=await res.json().catch(()=>({})); const msg=`Lock update failed: ${formatAirtable(j, res.statusText)}`; runStats.lastError=msg; chrome.storage.local.set({ runStats }); return false; } } return true; } catch(e){ const msg=formatErr(e); runStats.lastError=`Acquire lock error: ${msg}`; chrome.storage.local.set({ runStats }); return false; } }
async function heartbeatAccountLock(acct){ try{ const rec=await getOrCreateLockRecord(acct); if(!rec) return; const fields=rec.fields||{}; const { holder }=parsePickedBy(fields['Picked By']); if(holder!==instanceId) return; let res=await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'In Progress': true, 'Picked By': `${instanceId}:${Date.now()}` } }) }); if(!res.ok){ await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'Picked By': `${instanceId}:${Date.now()}` } }) }); } } catch{} }
async function releaseAccountLock(acct){ try{ const rec=await getOrCreateLockRecord(acct); if(!rec) return; const fields=rec.fields||{}; const { holder }=parsePickedBy(fields['Picked By']); if(holder && holder!==instanceId) return; let res=await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'In Progress': false, 'Picked By': '' } }) }); if(!res.ok){ await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_ID}/${rec.id}`,{ method:'PATCH', headers:{ Authorization:`Bearer ${AIRTABLE_API_KEY}`,'Content-Type':'application/json' }, body: JSON.stringify({ fields:{ 'Picked By': '' } }) }); } } catch{} }
async function checkAccountLock(acct){ try{ const rec=await getOrCreateLockRecord(acct); if(!rec) return { isLockedByOther:false, heldBySelf:false }; const fields=rec.fields||{}; const hasInProgress=Object.prototype.hasOwnProperty.call(fields,'In Progress'); let active=hasInProgress?!!fields['In Progress']:false; const { holder, ts }=parsePickedBy(fields['Picked By']); const now=Date.now(); const stale=!ts||now-ts>2*60*1000; if(!hasInProgress) active=!!holder && !stale; const heldBySelf=active && holder===instanceId && !stale; const isLockedByOther=active && holder!==instanceId && !stale; return { isLockedByOther, heldBySelf }; } catch(e){ return { isLockedByOther:false, heldBySelf:false, error:String(e&&e.message?e.message:e) }; } }


// Ensure file closes cleanly
}


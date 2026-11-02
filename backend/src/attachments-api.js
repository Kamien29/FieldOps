import { randomUUID } from 'node:crypto';
import { one, all, query, transaction } from './db.js';
const MAX_BYTES=1500000;
const TYPES=new Set(['image/jpeg','image/png','image/webp','application/pdf','text/plain']);
const fail=(status,code)=>Object.assign(new Error(code),{status,code});
const validId=x=>typeof x==='string'&&/^[\w-]{1,120}$/.test(x);
const metadata=r=>({id:r.id,jobId:r.job_id,organizationId:r.organization_id,messageId:r.message_id,fileName:r.file_name,mime:r.mime,size:r.byte_size,createdAt:r.created_at});
async function jobAccess(jobId,userId,write=false){
  const job=await one('SELECT id,assigned_to FROM jobs WHERE id=$1',[jobId]);
  if(!job)throw fail(404,'job_not_found');
  if(job.assigned_to===userId)return;
  if(!write&&await one("SELECT 1 FROM job_offers WHERE job_id=$1 AND recipient_id=$2 AND status='pending'",[jobId,userId]))return;
  throw fail(404,'job_not_found');
}
async function chatAccess(orgId,otherId,userId){
  if(!validId(orgId)||!await one('SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2',[orgId,userId]))throw fail(404,'organization_not_found');
  if(otherId&&(!validId(otherId)||otherId===userId||!await one('SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2',[orgId,otherId])))throw fail(404,'member_not_found');
}
function decode(b){
  if(!b||typeof b.fileName!=='string'||!b.fileName.trim()||b.fileName.length>180||!TYPES.has(b.mime)||typeof b.dataBase64!=='string')throw fail(400,'invalid_attachment');
  if(b.dataBase64.length>Math.ceil(MAX_BYTES/3)*4+4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b.dataBase64))throw fail(413,'attachment_too_large');
  const bytes=Buffer.from(b.dataBase64,'base64');
  if(!bytes.length||bytes.length>MAX_BYTES)throw fail(413,'attachment_too_large');
  const signatures={
    'image/jpeg':bytes.subarray(0,3).equals(Buffer.from([255,216,255])),
    'image/png':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/webp':bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP',
    'application/pdf':bytes.toString('ascii',0,5)==='%PDF-',
    'text/plain':!bytes.includes(0)
  };
  if(!signatures[b.mime])throw fail(400,'invalid_attachment_content');
  return {fileName:b.fileName.trim().replace(/[\\/\x00-\x1f]/g,'_'),mime:b.mime,bytes};
}
async function canRead(row,userId){
  if(row.job_id){await jobAccess(row.job_id,userId);return;}
  await chatAccess(row.organization_id,null,userId);
  const message=await one('SELECT sender_id,recipient_id FROM organization_messages WHERE id=$1 AND organization_id=$2',[row.message_id,row.organization_id]);
  if(!message||(message.recipient_id&&message.sender_id!==userId&&message.recipient_id!==userId))throw fail(404,'attachment_not_found');
}
export async function handleAttachmentRoute({req,res,p,m,userId,readJson,send,parsed,now}){
  let match;
  if(p==='/api/attachments'&&m==='GET'){
    const jobId=parsed.searchParams.get('jobId'),orgId=parsed.searchParams.get('orgId');
    if(jobId){if(!validId(jobId))throw fail(400,'invalid_job_id');await jobAccess(jobId,userId);const rows=await all('SELECT * FROM fieldops_attachments WHERE job_id=$1 ORDER BY created_at DESC LIMIT 100',[jobId]);send(res,200,{attachments:rows.map(metadata)});return true;}
    if(orgId){
      const otherId=parsed.searchParams.get('otherId')||null;await chatAccess(orgId,otherId,userId);
      const rows=await all(`SELECT a.* FROM fieldops_attachments a JOIN organization_messages m ON m.id=a.message_id
        WHERE a.organization_id=$1 AND (($2::text IS NULL AND m.recipient_id IS NULL) OR
        ($2::text IS NOT NULL AND ((m.sender_id=$3 AND m.recipient_id=$2) OR (m.sender_id=$2 AND m.recipient_id=$3))))
        ORDER BY a.created_at DESC LIMIT 100`,[orgId,otherId,userId]);
      send(res,200,{attachments:rows.map(metadata)});return true;
    }
    throw fail(400,'scope_required');
  }
  if(p==='/api/attachments'&&m==='POST'){
    const b=await readJson(req),file=decode(b),jobId=b.jobId||null,orgId=b.organizationId||null,otherId=b.recipientId||null;
    if(Boolean(jobId)===Boolean(orgId))throw fail(400,'attachment_scope_required');
    if(jobId){if(!validId(jobId))throw fail(400,'invalid_job_id');await jobAccess(jobId,userId,true);}
    else await chatAccess(orgId,otherId,userId);
    const created=await transaction(async client=>{
      let messageId=null;
      if(orgId){
        const message=await one('INSERT INTO organization_messages(organization_id,sender_id,recipient_id,content,created_at) VALUES($1,$2,$3,$4,$5) RETURNING id',[orgId,userId,otherId,'📎 '+file.fileName,now()],client);
        messageId=message.id;
      }
      const id='att-'+randomUUID();
      const row=await one('INSERT INTO fieldops_attachments(id,job_id,organization_id,message_id,uploaded_by,file_name,mime,byte_size,data,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[id,jobId,orgId,messageId,userId,file.fileName,file.mime,file.bytes.length,file.bytes,now()],client);
      return metadata(row);
    });
    send(res,201,{attachment:created});return true;
  }
  if((match=p.match(/^\/api\/attachments\/([\w-]+)$/))&&m==='GET'){
    const row=await one('SELECT * FROM fieldops_attachments WHERE id=$1',[match[1]]);
    if(!row)throw fail(404,'attachment_not_found');
    await canRead(row,userId);
    send(res,200,{attachment:metadata(row),dataBase64:Buffer.from(row.data).toString('base64')});return true;
  }
  if((match=p.match(/^\/api\/attachments\/([\w-]+)$/))&&m==='DELETE'){
    const row=await one('SELECT * FROM fieldops_attachments WHERE id=$1',[match[1]]);
    if(!row)throw fail(404,'attachment_not_found');
    if(row.uploaded_by!==userId)throw fail(403,'attachment_owner_required');
    if(row.job_id)await jobAccess(row.job_id,userId,true);else await canRead(row,userId);
    await query('DELETE FROM fieldops_attachments WHERE id=$1',[row.id]);send(res,200,{ok:true});return true;
  }
  return false;
}

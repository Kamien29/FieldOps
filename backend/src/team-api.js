/**
 * Collaboration API. All handlers require an authenticated user.
 * Organization membership is checked on EACH request, not only in the UI.
 * Changes that affect membership or job ownership are protected by SQL transactions.
 * No e-mails are sent: invitations appear in FieldOps after sign-in.
 */
import { randomUUID } from 'node:crypto';
import { one, all, query, transaction } from './db.js';

const id = (prefix) => `${prefix}-${randomUUID()}`;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const allowedAvatars = new Set(['image/jpeg','image/png','image/webp']);
const MAX_AVATAR_BYTES = 300 * 1024;
const validId = (text) => typeof text === 'string' && /^[A-Za-z0-9-]{3,100}$/.test(text);

export const TEAM_ROUTES = Object.freeze({
  ORGS: '/api/organizations', INVITES: '/api/invitations',
  OFFERS: '/api/job-offers', AVATAR: '/api/me/avatar',
});

export function normalizedEmail(text, fail) {
  const value = typeof text === 'string' ? text.trim().toLowerCase() : '';
  if (!emailPattern.test(value) || value.length > 254) throw fail(400, 'invalid_email');
  return value;
}
function requiredText(value, max, code, fail, min = 1) {
  if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw fail(400,code);
  return value.trim();
}
function decodeAvatar(body, fail) {
  if (!body || !allowedAvatars.has(body.mime) || typeof body.dataBase64 !== 'string') throw fail(400,'invalid_avatar');
  const b64 = body.dataBase64;
  if (b64.length > Math.ceil(MAX_AVATAR_BYTES / 3) * 4 + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(b64)) {
    throw fail(413,'avatar_too_large');
  }
  const data = Buffer.from(b64,'base64');
  if (!data.length || data.length > MAX_AVATAR_BYTES) throw fail(413,'avatar_too_large');
  const jpeg = data.length >= 3 && data[0]===0xff && data[1]===0xd8 && data[2]===0xff;
  const png = data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const webp = data.toString('ascii',0,4)==='RIFF' && data.toString('ascii',8,12)==='WEBP';
  if (!(body.mime==='image/jpeg' && jpeg || body.mime==='image/png' && png || body.mime==='image/webp' && webp)) throw fail(400,'invalid_avatar');
  return data;
}
function sendImage(res, row) {
  res.writeHead(200, {'Content-Type':row.avatar_mime,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'});
  res.end(row.avatar_data);
}
async function membership(orgId,userId,db,fail,admin=false) {
  const member = await one('SELECT role FROM organization_members WHERE organization_id=$1 AND user_id=$2',[orgId,userId],db);
  if (!member) throw fail(404,'organization_not_found');
  if (admin && !['owner','admin'].includes(member.role)) throw fail(403,'organization_admin_required');
  return member;
}
async function sharedMember(orgId,me,other,db,fail) {
  await membership(orgId,me,db,fail);
  if (!validId(other) || !await one('SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2',[orgId,other],db)) {
    throw fail(404,'member_not_found');
  }
}
function toChatRow(row) {
  return {id:String(row.id),organizationId:row.organization_id,senderId:row.sender_id,recipientId:row.recipient_id,
    senderName:row.sender_name,content:row.content,createdAt:row.created_at};
}
function chatSelect(orgId, args=[], recipient = null) {
  if (!recipient) return {
    sql:`SELECT m.*,u.name sender_name FROM organization_messages m JOIN users u ON u.id=m.sender_id
      WHERE m.organization_id=$1 AND m.recipient_id IS NULL ORDER BY m.id DESC LIMIT 80`,
    params:[orgId],
  };
  const me = args[0];
  return {
    sql:`SELECT m.*,u.name sender_name FROM organization_messages m JOIN users u ON u.id=m.sender_id
       WHERE m.organization_id=$1 AND ((m.sender_id=$2 AND m.recipient_id=$3) OR (m.sender_id=$3 AND m.recipient_id=$2))
       ORDER BY m.id DESC LIMIT 80`,
    params:[orgId,me,recipient],
  };
}

/** Return true when the route was handled. Caller already validated the session/CSRF. */
export async function handleTeamRoute({req,res,p,m,userId,readJson,send,fail,now}) {
  let match;
  if (p === '/api/me/avatar') {
    if (m==='GET') {
      const row=await one('SELECT avatar_mime,avatar_data FROM users WHERE id=$1',[userId]);
      if (!row?.avatar_data) throw fail(404,'avatar_not_found');
      sendImage(res,row);return true;
    }
    if (m==='DELETE') {await query('UPDATE users SET avatar_data=NULL,avatar_mime=NULL WHERE id=$1',[userId]);send(res,200,{ok:true});return true;}
    if (m==='PUT') {
      const body=await readJson(req);const avatar=decodeAvatar(body,fail);
      await query('UPDATE users SET avatar_mime=$1,avatar_data=$2 WHERE id=$3',[body.mime,avatar,userId]);
      send(res,200,{ok:true});return true;
    }
  }
  if (p==='/api/organizations') {
    if (m==='GET') {
      const rows=await all(`SELECT o.id,o.name,o.created_at,m.role,
        (SELECT COUNT(*)::integer FROM organization_members x WHERE x.organization_id=o.id) member_count
        FROM organizations o JOIN organization_members m ON m.organization_id=o.id WHERE m.user_id=$1 ORDER BY lower(o.name)`,[userId]);
      send(res,200,{organizations:rows.map(r=>({id:r.id,name:r.name,role:r.role,memberCount:r.member_count,createdAt:r.created_at}))});return true;
    }
    if (m==='POST') {
      const body=await readJson(req);const name=requiredText(body.name,120,'invalid_organization_name',fail,2);
      const org=await transaction(async(db)=>{
        const orgId=id('org'),t=now();
        await query('INSERT INTO organizations(id,name,created_by,created_at) VALUES($1,$2,$3,$4)',[orgId,name,userId,t],db);
        await query("INSERT INTO organization_members(organization_id,user_id,role,joined_at) VALUES($1,$2,'owner',$3)",[orgId,userId,t],db);
        return {id:orgId,name,role:'owner',memberCount:1,createdAt:t};
      });send(res,201,{organization:org});return true;
    }
  }
  if (p==='/api/invitations' && m==='GET') {
    const me=await one('SELECT email FROM users WHERE id=$1',[userId]);
    const rows=await all(`SELECT i.id,i.organization_id,i.status,i.created_at,o.name organization_name,u.name invited_by_name
      FROM organization_invitations i JOIN organizations o ON o.id=i.organization_id JOIN users u ON u.id=i.invited_by
      WHERE lower(i.email)=lower($1) AND i.status='pending' ORDER BY i.created_at DESC`,[me.email]);
    send(res,200,{invitations:rows.map(r=>({id:r.id,organizationId:r.organization_id,organizationName:r.organization_name,invitedBy:r.invited_by_name,createdAt:r.created_at}))});return true;
  }
  if ((match=p.match(/^\/api\/invitations\/([^/]+)\/(accept|decline)$/)) && m==='POST') {
    const [_,inviteId,action]=match;
    await transaction(async(db)=>{
      const i=await one('SELECT * FROM organization_invitations WHERE id=$1 FOR UPDATE',[inviteId],db);
      const me=await one('SELECT email FROM users WHERE id=$1',[userId],db);
      if (!i || i.status!=='pending' || i.email.toLowerCase()!==me.email.toLowerCase()) throw fail(404,'invitation_not_found');
      if (action==='accept') {
        if (!await one('SELECT 1 FROM organization_members WHERE organization_id=$1 AND user_id=$2',[i.organization_id,userId],db)) {
          await query("INSERT INTO organization_members(organization_id,user_id,role,joined_at) VALUES($1,$2,'member',$3)",[i.organization_id,userId,now()],db);
        }
      }
      await query('UPDATE organization_invitations SET status=$1,responded_at=$2 WHERE id=$3',[action==='accept'?'accepted':'declined',now(),inviteId],db);
    });send(res,200,{ok:true});return true;
  }
  if (p==='/api/job-offers' && m==='GET') {
    const rows=await all(`SELECT f.id,f.job_id,f.sender_id,f.recipient_id,f.organization_id,f.status,f.created_at,
       j.title,j.status job_status,s.name sender_name,r.name recipient_name,o.name organization_name
       FROM job_offers f JOIN jobs j ON j.id=f.job_id JOIN users s ON s.id=f.sender_id
       JOIN users r ON r.id=f.recipient_id LEFT JOIN organizations o ON o.id=f.organization_id
       WHERE f.sender_id=$1 OR f.recipient_id=$1 ORDER BY f.created_at DESC LIMIT 100`,[userId]);
    send(res,200,{offers:rows.map(r=>({id:r.id,jobId:r.job_id,title:r.title,jobStatus:r.job_status,
      senderId:r.sender_id,senderName:r.sender_name,recipientId:r.recipient_id,recipientName:r.recipient_name,
      organizationId:r.organization_id,organizationName:r.organization_name,status:r.status,createdAt:r.created_at}))});return true;
  }
  if (p==='/api/job-offers' && m==='POST') {
    const b=await readJson(req);const recipientEmail=normalizedEmail(b.toEmail,fail);
    if (!validId(b.jobId)) throw fail(400,'invalid_job_id');
    const offer=await transaction(async(db)=>{
      const job=await one('SELECT * FROM jobs WHERE id=$1 FOR UPDATE',[b.jobId],db);
      if (!job || job.assigned_to!==userId) throw fail(404,'job_not_found');
      if (job.status==='done' || job.status==='cancelled' || await one('SELECT 1 FROM reports WHERE job_id=$1',[job.id],db) ||
          await one('SELECT 1 FROM photos WHERE job_id=$1 LIMIT 1',[job.id],db)) throw fail(409,'handoff_not_allowed');
      const receiver=await one('SELECT id,name FROM users WHERE lower(email)=lower($1)',[recipientEmail],db);
      if (!receiver) throw fail(404,'recipient_not_found');
      if (receiver.id===userId) throw fail(400,'cannot_offer_to_self');
      if (job.organization_id) {
        await sharedMember(job.organization_id,userId,receiver.id,db,fail);
      }
      if (await one("SELECT 1 FROM job_offers WHERE job_id=$1 AND status='pending'",[job.id],db)) throw fail(409,'offer_already_pending');
      const offerId=id('offer');
      await query(`INSERT INTO job_offers(id,job_id,sender_id,recipient_id,organization_id,job_version,status,created_at)
         VALUES($1,$2,$3,$4,$5,$6,'pending',$7)`,[offerId,job.id,userId,receiver.id,job.organization_id,job.version,now()],db);
      return {id:offerId,recipientName:receiver.name};
    });send(res,201,{offer});return true;
  }
  if ((match=p.match(/^\/api\/job-offers\/([^/]+)\/(accept|decline|cancel)$/)) && m==='POST') {
    const [_,offerId,action]=match;
    let expired=false;
    await transaction(async(db)=>{
      // Lock the offer and then the job. All offer mutations use the same order.
      const f=await one('SELECT * FROM job_offers WHERE id=$1 FOR UPDATE',[offerId],db);
      if (!f || f.status!=='pending') throw fail(404,'offer_not_found');
      if (action==='cancel' ? f.sender_id!==userId : f.recipient_id!==userId) throw fail(404,'offer_not_found');
      const job=await one('SELECT * FROM jobs WHERE id=$1 FOR UPDATE',[f.job_id],db);
      if (action==='accept') {
        if (!job || job.assigned_to!==f.sender_id || job.version!==f.job_version || job.status==='done' || job.status==='cancelled') {
          await query("UPDATE job_offers SET status='expired',responded_at=$1 WHERE id=$2",[now(),offerId],db);
          expired=true;
          return;
        }
        if (job.organization_id) await sharedMember(job.organization_id,f.sender_id,f.recipient_id,db,fail);
        await query('UPDATE jobs SET assigned_to=$1,device_id=NULL,version=version+1,updated_at=$2 WHERE id=$3',[userId,now(),job.id],db);
      }
      await query('UPDATE job_offers SET status=$1,responded_at=$2 WHERE id=$3',[{accept:'accepted',decline:'declined',cancel:'cancelled'}[action],now(),offerId],db);
    });
    if (expired) throw fail(409,'offer_expired');
    send(res,200,{ok:true});return true;
  }

  // A member can leave a company only after handing off all company jobs.
  // The owner must first appoint a successor (owner transfer is a future feature).
  if ((match=p.match(/^\/api\/organizations\/([^/]+)\/leave$/)) && m==='POST') {
    const orgId=match[1];
    await transaction(async(db)=>{
      const member=await membership(orgId,userId,db,fail);
      if (member.role==='owner') throw fail(409,'owner_cannot_leave');
      if (await one('SELECT 1 FROM jobs WHERE organization_id=$1 AND assigned_to=$2 LIMIT 1',[orgId,userId],db)) {
        throw fail(409,'reassign_company_jobs_first');
      }
      await query('DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2',[orgId,userId],db);
    });
    send(res,200,{ok:true});return true;
  }
  // Company admins can remove inactive members but cannot remove the owner or
  // orphan company jobs. The affected member loses message access immediately.
  if ((match=p.match(/^\/api\/organizations\/([^/]+)\/members\/([^/]+)$/)) && m==='DELETE') {
    const [,orgId,targetId]=match;
    await transaction(async(db)=>{
      await membership(orgId,userId,db,fail,true);
      if (targetId===userId) throw fail(400,'use_leave_company');
      const target=await membership(orgId,targetId,db,fail);
      if (target.role==='owner') throw fail(403,'cannot_remove_owner');
      if (await one('SELECT 1 FROM jobs WHERE organization_id=$1 AND assigned_to=$2 LIMIT 1',[orgId,targetId],db)) {
        throw fail(409,'reassign_company_jobs_first');
      }
      await query('DELETE FROM organization_members WHERE organization_id=$1 AND user_id=$2',[orgId,targetId],db);
    });
    send(res,200,{ok:true});return true;
  }
  if ((match=p.match(/^\/api\/organizations\/([^/]+)\/members\/([^/]+)\/avatar$/)) && m==='GET') {
    const [,orgId,other]=match;await sharedMember(orgId,userId,other,undefined,fail);
    const row=await one('SELECT avatar_mime,avatar_data FROM users WHERE id=$1',[other]);
    if (!row?.avatar_data) throw fail(404,'avatar_not_found');sendImage(res,row);return true;
  }
  if ((match=p.match(/^\/api\/organizations\/([^/]+)\/members$/)) && m==='GET') {
    const orgId=match[1];await membership(orgId,userId,undefined,fail);
    const rows=await all(`SELECT u.id,u.name,u.email,m.role,(u.avatar_data IS NOT NULL) has_avatar FROM organization_members m
      JOIN users u ON u.id=m.user_id WHERE m.organization_id=$1 ORDER BY CASE m.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,u.name`,[orgId]);
    send(res,200,{members:rows.map(r=>({id:r.id,name:r.name,email:r.email,role:r.role,hasAvatar:r.has_avatar}))});return true;
  }
  if ((match=p.match(/^\/api\/organizations\/([^/]+)\/invites$/)) && m==='POST') {
    const orgId=match[1];const b=await readJson(req);const invitedEmail=normalizedEmail(b.email,fail);
    await membership(orgId,userId,undefined,fail,true);
    const me=await one('SELECT email FROM users WHERE id=$1',[userId]);
    if (me.email.toLowerCase()===invitedEmail) throw fail(400,'cannot_invite_self');
    const member=await one(`SELECT 1 FROM organization_members m JOIN users u ON u.id=m.user_id
      WHERE m.organization_id=$1 AND lower(u.email)=lower($2)`,[orgId,invitedEmail]);
    if (member) throw fail(409,'already_member');
    const invitationId=id('inv');
    try {
      await query("INSERT INTO organization_invitations(id,organization_id,email,invited_by,status,created_at) VALUES($1,$2,$3,$4,'pending',$5)",
        [invitationId,orgId,invitedEmail,userId,now()]);
    } catch(e) {if (e.code==='23505') throw fail(409,'invitation_pending');throw e;}
    send(res,201,{invitation:{id:invitationId,email:invitedEmail}});return true;
  }
  if ((match=p.match(/^\/api\/organizations\/([^/]+)\/jobs$/)) && m==='GET') {
    const orgId=match[1];await membership(orgId,userId,undefined,fail);
    // The team sees operational metadata, but not full reports or private photos.
    const rows=await all(`SELECT j.id,j.title,j.customer,j.scheduled_at,j.status,j.assigned_to,u.name assigned_name
      FROM jobs j JOIN users u ON u.id=j.assigned_to WHERE j.organization_id=$1 ORDER BY j.scheduled_at LIMIT 200`,[orgId]);
    send(res,200,{jobs:rows.map(r=>({id:r.id,title:r.title,customer:r.customer,scheduledAt:r.scheduled_at,
      status:r.status,assigneeId:r.assigned_to,assigneeName:r.assigned_name}))});return true;
  }
  if ((match=p.match(/^\/api\/organizations\/([^/]+)\/jobs$/)) && m==='POST') {
    const orgId=match[1],b=await readJson(req);await membership(orgId,userId,undefined,fail);
    const title=requiredText(b.title,200,'invalid_title',fail);
    const customer=requiredText(b.customer,200,'invalid_customer',fail);
    const address=requiredText(b.address,300,'invalid_address',fail);
    const description=b.description==null?'':requiredText(b.description,5000,'invalid_description',fail,0);
    const scheduledAt=new Date(b.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime()) || scheduledAt.getUTCFullYear()<2000 || scheduledAt.getUTCFullYear()>2100) throw fail(400,'invalid_scheduledAt');
    const jobId=`J-${randomUUID()}`, t=now();
    await query(`INSERT INTO jobs(id,assigned_to,title,customer,address,scheduled_at,description,status,created_at,updated_at,organization_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,'new',$8,$8,$9)`,[jobId,userId,title,customer,address,scheduledAt.toISOString(),description,t,orgId]);
    send(res,201,{job:{id:jobId,title,customer}});return true;
  }
  if ((match=p.match(/^\/api\/organizations\/([^/]+)\/messages(?:\/([^/]+))?$/)) && (m==='GET'||m==='POST')) {
    const [,orgId,otherId]=match;
    if (otherId) { if (otherId===userId) throw fail(400,'cannot_chat_with_self'); await sharedMember(orgId,userId,otherId,undefined,fail); }
    else await membership(orgId,userId,undefined,fail);
    if (m==='GET') {
      const q=chatSelect(orgId,[userId],otherId);
      const rows=await all(q.sql,q.params);
      send(res,200,{messages:rows.reverse().map(toChatRow)});return true;
    }
    const b=await readJson(req),content=requiredText(b.content,2000,'invalid_message',fail);
    const rows=await all(`INSERT INTO organization_messages(organization_id,sender_id,recipient_id,content,created_at)
      VALUES($1,$2,$3,$4,$5) RETURNING id`,[orgId,userId,otherId||null,content,now()]);
    send(res,201,{messageId:String(rows[0].id)});return true;
  }
  return false;
}

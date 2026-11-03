/** Online-only company/team API. Offline jobs continue using the separate SQLite queue. */
import { apiFetch } from './api';

export interface Organization { id:string;name:string;role:'owner'|'admin'|'member';memberCount:number; }
export interface Member {id:string;name:string;email:string;role:string;hasAvatar:boolean;}
export interface Invitation {id:string;organizationId:string;organizationName:string;invitedBy:string;}
export interface JobOffer {id:string;jobId:string;title:string;senderId:string;senderName:string;
  recipientId:string;recipientName:string;status:string;organizationName?:string;}
export interface Message {id:string;senderId:string;senderName:string;recipientId:string|null;content:string;createdAt:string;}
export interface CompanyJob {id:string;title:string;customer:string;status:string;assigneeName:string;assigneeId:string;}

const org = (id:string) => `/api/organizations/${encodeURIComponent(id)}`;
export const listOrganizations=async()=> (await apiFetch<{organizations:Organization[]}>('/api/organizations')).organizations;
export const createOrganization=(name:string)=>apiFetch<{organization:Organization}>('/api/organizations',{method:'POST',body:{name}});
export const listInvites=async()=> (await apiFetch<{invitations:Invitation[]}>('/api/invitations')).invitations;
export const replyInvite=(id:string,action:'accept'|'decline')=>apiFetch(`/api/invitations/${encodeURIComponent(id)}/${action}`,{method:'POST'});
export const listMembers=async(id:string)=>(await apiFetch<{members:Member[]}>(`${org(id)}/members`)).members;
export const invite=(id:string,email:string)=>apiFetch(`${org(id)}/invites`,{method:'POST',body:{email}});
export const leaveCompany=(id:string)=>apiFetch(`${org(id)}/leave`,{method:'POST'});
export const removeMember=(id:string,memberId:string)=>apiFetch(`${org(id)}/members/${encodeURIComponent(memberId)}`,{method:'DELETE'});
export const listCompanyJobs=async(id:string)=>(await apiFetch<{jobs:CompanyJob[]}>(`${org(id)}/jobs`)).jobs;
export const createCompanyJob=(id:string,input:{title:string;customer:string;address:string;scheduledAt:string;description:string})=>
  apiFetch(`${org(id)}/jobs`,{method:'POST',body:input});
const channel=(id:string,otherId:string)=>`${org(id)}/messages${otherId?'/'+encodeURIComponent(otherId):''}`;
export const listMessages=async(id:string,otherId:string)=>(await apiFetch<{messages:Message[]}>(channel(id,otherId))).messages;
export const sendMessage=(id:string,otherId:string,content:string)=>apiFetch(channel(id,otherId),{method:'POST',body:{content}});
export const listOffers=async()=> (await apiFetch<{offers:JobOffer[]}>('/api/job-offers')).offers;
export const sendOffer=(jobId:string,toEmail:string)=>apiFetch('/api/job-offers',{method:'POST',body:{jobId,toEmail}});
export const decideOffer=(id:string,action:'accept'|'decline'|'cancel')=>apiFetch(`/api/job-offers/${encodeURIComponent(id)}/${action}`,{method:'POST'});

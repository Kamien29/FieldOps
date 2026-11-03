/** Attachments are online-only. The existing offline job/report queue is unchanged. */
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { apiFetch } from './api';

export type Attachment = {id:string;jobId:string|null;organizationId:string|null;messageId:number|null;
  fileName:string;mime:string;size:number;createdAt:string};
const MAX=1_500_000;
const mimeTypes=['image/jpeg','image/png','image/webp','application/pdf','text/plain'];
export async function pickAndUpload(scope:{jobId:string}|{organizationId:string;recipientId:string}) {
  const result=await DocumentPicker.getDocumentAsync({type:mimeTypes,copyToCacheDirectory:true,multiple:false});
  if(result.canceled||!result.assets[0])return false;
  const file=result.assets[0];
  if(file.size && file.size>MAX)throw new Error('Plik przekracza limit 1,5 MB.');
  const mime=file.mimeType||'application/octet-stream';
  if(!mimeTypes.includes(mime))throw new Error('NieobsĹ‚ugiwany format pliku.');
  const dataBase64=await FileSystem.readAsStringAsync(file.uri,{encoding:FileSystem.EncodingType.Base64});
  if(dataBase64.length>Math.ceil(MAX/3)*4+4)throw new Error('Plik przekracza limit 1,5 MB.');
  await apiFetch('/api/attachments',{method:'POST',body:{...scope,fileName:file.name,mime,dataBase64}});
  return true;
}
export async function listJobAttachments(jobId:string):Promise<Attachment[]> {
  return (await apiFetch<{attachments:Attachment[]}>(`/api/attachments?jobId=${encodeURIComponent(jobId)}`)).attachments;
}
export async function listChatAttachments(orgId:string,otherId:string):Promise<Attachment[]> {
  return (await apiFetch<{attachments:Attachment[]}>(`/api/attachments?orgId=${encodeURIComponent(orgId)}&otherId=${encodeURIComponent(otherId)}`)).attachments;
}
export async function shareAttachment(a:Attachment) {
  const response=await apiFetch<{dataBase64:string}>(`/api/attachments/${encodeURIComponent(a.id)}`);
  const safeName=a.fileName.replace(/[^\w.\-]/g,'_');
  const path=`${FileSystem.cacheDirectory}fieldops-${a.id}-${safeName}`;
  await FileSystem.writeAsStringAsync(path,response.dataBase64,{encoding:FileSystem.EncodingType.Base64});
  if(!await Sharing.isAvailableAsync())throw new Error('UdostÄ™pnianie plikĂłw nie jest dostÄ™pne.');
  await Sharing.shareAsync(path,{mimeType:a.mime,dialogTitle:'OtwĂłrz zaĹ‚Ä…cznik'});
}

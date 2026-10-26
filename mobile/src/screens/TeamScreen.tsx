/**
 * Online workspace. Company chat/offers do not join the offline SQLite outbox:
 * a live server response is required before a job changes hands.
 */
import React,{useCallback,useEffect,useState} from 'react';
import {Alert,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../nav';
import {listJobs} from '../db';
import {Btn} from '../ui';
import {colors,s} from '../theme';
import type {Job} from '../types';
import * as teams from '../team-api';

type Props=NativeStackScreenProps<RootStackParamList,'Team'>;
const Field=({placeholder,value,onChangeText,secure=false}:{placeholder:string;value:string;onChangeText:(v:string)=>void;secure?:boolean}) =>
  <TextInput style={[s.input,{marginTop:7}]} placeholder={placeholder} value={value} onChangeText={onChangeText}
    autoCapitalize="none" secureTextEntry={secure} />;
const Header=({children}:{children:string})=><Text style={[s.h2,{marginTop:12}]}>{children}</Text>;
const Info=({children}:{children:string})=><Text style={[s.muted,{marginVertical:6}]}>{children}</Text>;
const Card=({children}:{children:React.ReactNode})=><View style={s.card}>{children}</View>;

export default function TeamScreen({navigation}:Props) {
  const [mode,setMode]=useState<'companies'|'chat'|'offers'>('companies');
  const [orgs,setOrgs]=useState<teams.Organization[]>([]);
  const [orgId,setOrgId]=useState('');
  const [invites,setInvites]=useState<teams.Invitation[]>([]);
  const [members,setMembers]=useState<teams.Member[]>([]);
  const [companyJobs,setCompanyJobs]=useState<teams.CompanyJob[]>([]);
  const [chatOther,setChatOther]=useState('');
  const [messages,setMessages]=useState<teams.Message[]>([]);
  const [offers,setOffers]=useState<teams.JobOffer[]>([]);
  const [localJobs,setLocalJobs]=useState<Job[]>([]);
  const [name,setName]=useState('');
  const [inviteEmail,setInviteEmail]=useState('');
  const [chatText,setChatText]=useState('');
  const [offerEmail,setOfferEmail]=useState('');
  const [offerJobId,setOfferJobId]=useState('');
  const [busy,setBusy]=useState(false);
  const [myUserId,setMyUserId]=useState('');
  const [jobForm,setJobForm]=useState({title:'',customer:'',address:'',date:'',description:''});
  const selected=orgs.find(o=>o.id===orgId);

  const reload=useCallback(async()=>{
    const [organizations,received,jobOffers,offlineJobs]=await Promise.all([
      teams.listOrganizations(),teams.listInvites(),teams.listOffers(),listJobs(),
    ]);
    setOrgs(organizations);setInvites(received);setOffers(jobOffers);setLocalJobs(offlineJobs);
    setOrgId(current=>organizations.some(o=>o.id===current)?current:(organizations[0]?.id||''));
  },[]);
  const reloadOrg=useCallback(async()=>{
    if (!orgId) {setMembers([]);setCompanyJobs([]);setMessages([]);return;}
    const [people,jobs]=await Promise.all([teams.listMembers(orgId),teams.listCompanyJobs(orgId)]);
    setMembers(people);setCompanyJobs(jobs);
  },[orgId]);
  const reloadChat=useCallback(async()=>{
    if (orgId) setMessages(await teams.listMessages(orgId,chatOther));
  },[orgId,chatOther]);
  useEffect(()=>{
    SecureStore.getItemAsync('fieldops_owner_id').then(value=>setMyUserId(value||'')).catch(()=>{});
    reload().catch(e=>Alert.alert('Firmy',String(e)));
  },[reload]);
  useEffect(()=>{reloadOrg().catch(e=>Alert.alert('Firma',String(e)));},[reloadOrg]);
  useEffect(()=>{reloadChat().catch(()=>{});},[reloadChat]);
  useEffect(()=>{if (mode!=='chat'||!orgId)return;const t=setInterval(()=>reloadChat().catch(()=>{}),15000);return()=>clearInterval(t);},[mode,orgId,reloadChat]);
  const act=async(fn:()=>Promise<unknown>,success:string)=>{
    setBusy(true);
    try {await fn();await reload();await reloadOrg();await reloadChat();Alert.alert('FieldOps',success);}
    catch(e){Alert.alert('Nie udało się',e instanceof Error?e.message:String(e));}
    finally{setBusy(false);}
  };
  const choose=(id:string)=>{setOrgId(id);setChatOther('');};
  const eligible=localJobs.filter(j=>j.syncState==='synced'&&!['done','cancelled'].includes(j.status)&&!j.hasReport);

  return <View style={s.screen}>
    <View style={{flexDirection:'row',padding:10,gap:6}}>
      {([['companies','Firmy'],['chat','Czat'],['offers','Przekazania']] as const).map(([key,title])=><Pressable key={key}
        onPress={()=>setMode(key)} style={{flex:1,borderRadius:9,padding:10,backgroundColor:mode===key?colors.primary:colors.primarySoft}}>
        <Text style={{textAlign:'center',color:mode===key?'white':colors.text,fontWeight:'700'}}>{title}</Text>
      </Pressable>)}
    </View>
    <ScrollView contentContainerStyle={{padding:14,paddingBottom:40}} keyboardShouldPersistTaps="handled">
      {mode==='companies'&&<>
        <Card><Header>Twoje firmy i grupy</Header>
          {orgs.length?orgs.map(o=><Pressable key={o.id} onPress={()=>choose(o.id)} style={{paddingVertical:9}}>
            <Text style={{color:o.id===orgId?colors.primary:colors.text,fontWeight:'700'}}>{o.id===orgId?'✓ ':''}{o.name}</Text>
            <Info>{o.memberCount} osób · {o.role}</Info></Pressable>):<Info>Nie należysz jeszcze do żadnej firmy.</Info>}
          <Header>Utwórz firmę</Header><Field placeholder="Nazwa firmy" value={name} onChangeText={setName}/>
          <Btn title="Utwórz firmę" disabled={busy||name.trim().length<2} onPress={()=>void act(async()=>{
            const r=await teams.createOrganization(name.trim());setName('');setOrgId(r.organization.id);
          },'Firma została utworzona.')}/>
        </Card>
        <Card><Header>Zaproszenia do firm</Header>
          {invites.length?invites.map(i=><View key={i.id} style={{paddingVertical:8}}>
            <Text style={s.text}>{i.organizationName} · zaprasza: {i.invitedBy}</Text>
            <View style={{flexDirection:'row',gap:8,marginTop:8}}>
              <View style={{flex:1}}><Btn title="Dołącz" disabled={busy} onPress={()=>void act(()=>teams.replyInvite(i.id,'accept'),'Dołączono do firmy.')}/></View>
              <View style={{flex:1}}><Btn kind="secondary" title="Odrzuć" disabled={busy} onPress={()=>void act(()=>teams.replyInvite(i.id,'decline'),'Odrzucono zaproszenie.')}/></View>
            </View>
          </View>):<Info>Brak zaproszeń.</Info>}
        </Card>
        {selected&&<>
          <Card><Header>Członkowie: {selected.name}</Header>
            {members.map(m=><View key={m.id} style={{paddingVertical:7}}>
              <Text style={s.text}>{m.name} · {m.role}</Text><Info>{m.email}</Info>
              {m.id!==myUserId&&<Btn kind="secondary" title="Napisz prywatnie" onPress={()=>{setChatOther(m.id);setMode('chat');}}/>}
            </View>)}
            {['owner','admin'].includes(selected.role)&&<>
              <Header>Zaproś wykonawcę e-mailem</Header>
              <Field placeholder="wykonawca@firma.pl" value={inviteEmail} onChangeText={setInviteEmail}/>
              <Btn title="Wyślij zaproszenie" disabled={busy||!inviteEmail.includes('@')} onPress={()=>void act(async()=>{
                await teams.invite(orgId,inviteEmail.trim());setInviteEmail('');
              },'Zaproszenie pojawi się na koncie odbiorcy w FieldOps.')}/>
            </>}
            {selected.role!=='owner'&&<Btn kind="secondary" title="Opuść firmę" disabled={busy} onPress={()=>Alert.alert('Opuścić firmę?','Najpierw przekaż swoje firmowe zlecenia.',[
              {text:'Anuluj'}, {text:'Opuść',onPress:()=>void act(()=>teams.leaveCompany(orgId),'Opuszczono firmę.')},
            ])}/>}
          </Card>
          <Card><Header>Zlecenia firmowe</Header>
            {companyJobs.map(j=><View key={j.id} style={{paddingVertical:8}}>
              <Text style={s.text}>{j.title} · {j.customer}</Text><Info>{j.assigneeName} · {j.status}</Info>
            </View>)}
            {!companyJobs.length&&<Info>Brak zleceń firmowych.</Info>}
            <Header>Dodaj zlecenie firmowe</Header>
            {(['title','customer','address','date','description'] as const).map(key=><Field key={key}
              placeholder={{title:'Tytuł',customer:'Klient',address:'Adres',date:'Termin RRRR-MM-DD',description:'Opis (opcjonalnie)'}[key]}
              value={jobForm[key]} onChangeText={value=>setJobForm(current=>({...current,[key]:value}))}/>)}
            <Btn title="Utwórz firmowe zlecenie" disabled={busy||!jobForm.title||!jobForm.customer||!jobForm.address||!/\d{4}-\d{2}-\d{2}/.test(jobForm.date)}
              onPress={()=>void act(async()=>{
                await teams.createCompanyJob(orgId,{title:jobForm.title,customer:jobForm.customer,address:jobForm.address,
                  description:jobForm.description,scheduledAt:jobForm.date+'T12:00:00.000Z'});
                setJobForm({title:'',customer:'',address:'',date:'',description:''});
              },'Nowe zlecenie przypisano do Ciebie. Możesz przekazać je innej osobie.')}/>
          </Card>
        </>}
      </>}
      {mode==='chat'&&<Card><Header>Czat firmowy i prywatny</Header>
        {!selected?<Info>Najpierw utwórz firmę lub do niej dołącz.</Info>:<>
          <Info>Firma: {selected.name}</Info>
          <Pressable onPress={()=>setChatOther('')}><Text style={{color:!chatOther?colors.primary:colors.text,padding:8}}>Cała firma {chatOther?'':'✓'}</Text></Pressable>
          {members.filter(m=>m.id!==myUserId).map(m=><Pressable key={m.id} onPress={()=>setChatOther(m.id)}>
            <Text style={{color:chatOther===m.id?colors.primary:colors.text,padding:8}}>Prywatnie: {m.name} {chatOther===m.id?'✓':''}</Text>
          </Pressable>)}
          <View style={{backgroundColor:'#f2f5fb',padding:10,borderRadius:10,marginVertical:12}}>
            {messages.length?messages.map(m=><View key={m.id} style={{marginVertical:5,padding:9,backgroundColor:'#fff',borderRadius:8}}>
              <Text style={{fontWeight:'700',fontSize:12,color:colors.muted}}>{m.senderName} · {new Date(m.createdAt).toLocaleString('pl-PL')}</Text>
              <Text style={s.text}>{m.content}</Text>
            </View>):<Info>Brak wiadomości w tej rozmowie.</Info>}
          </View>
          <Field placeholder="Napisz wiadomość" value={chatText} onChangeText={setChatText}/>
          <Btn title="Wyślij" disabled={busy||!chatText.trim()} onPress={()=>void act(async()=>{
            await teams.sendMessage(orgId,chatOther,chatText.trim());setChatText('');
          },'Wysłano wiadomość.')}/>
          <Btn kind="secondary" title="Odśwież czat" onPress={()=>void reloadChat().catch(e=>Alert.alert('Błąd',String(e)))}/>
          <Info>Do czatu potrzebne jest połączenie z internetem.</Info>
        </>}
      </Card>}
      {mode==='offers'&&<>
        <Card><Header>Przekaż zlecenie innemu wykonawcy</Header>
          <Info>Odbiorca musi mieć własne konto FieldOps i zaakceptować propozycję. Offline przekazanie nie jest dostępne.</Info>
          {eligible.map(j=><Pressable key={j.id} onPress={()=>setOfferJobId(j.id)} style={{padding:8}}>
            <Text style={{color:offerJobId===j.id?colors.primary:colors.text}}>{offerJobId===j.id?'✓ ':''}{j.title} · {j.id}</Text>
          </Pressable>)}
          <Field placeholder="Adres e-mail odbiorcy" value={offerEmail} onChangeText={setOfferEmail}/>
          <Btn title="Wyślij propozycję" disabled={busy||!offerJobId||!offerEmail.includes('@')}
            onPress={()=>void act(async()=>{await teams.sendOffer(offerJobId,offerEmail.trim());setOfferEmail('');},'Propozycja wysłana.')}/>
        </Card>
        <Card><Header>Otrzymane i wysłane propozycje</Header>
          {offers.length?offers.map(o=><View key={o.id} style={{paddingVertical:12,borderBottomWidth:1,borderColor:colors.border}}>
            <Text style={s.text}>{o.title}</Text><Info>Od: {o.senderName} → {o.recipientName} · {o.status}</Info>
            {o.status==='pending'&&o.recipientId===myUserId&&<View style={{flexDirection:'row',gap:7}}>
              <View style={{flex:1}}><Btn title="Akceptuj" disabled={busy} onPress={()=>void act(()=>teams.decideOffer(o.id,'accept'),'Przyjęto zlecenie.')}/></View>
              <View style={{flex:1}}><Btn kind="secondary" title="Odrzuć" disabled={busy} onPress={()=>void act(()=>teams.decideOffer(o.id,'decline'),'Odrzucono propozycję.')}/></View>
            </View>}
            {o.status==='pending'&&o.senderId===myUserId&&<Btn kind="secondary" title="Wycofaj propozycję" disabled={busy}
              onPress={()=>void act(()=>teams.decideOffer(o.id,'cancel'),'Wycofano propozycję.')}/>}
          </View>):<Info>Brak propozycji.</Info>}
          <Btn kind="secondary" title="Odśwież" onPress={()=>void reload().catch(e=>Alert.alert('Błąd',String(e)))}/>
        </Card>
      </>}
    </ScrollView>
  </View>;
}

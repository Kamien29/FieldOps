import React,{useCallback,useEffect,useState} from 'react';
import {Alert,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from 'react-native';
import type {NativeStackScreenProps} from '@react-navigation/native-stack';
import type {RootStackParamList} from '../nav';
import {createLocalJob,editLocalJob,getJob} from '../db';
import {useSync} from '../SyncContext';
import {Btn,SyncBar} from '../ui';
import {s} from '../theme';

type Props=NativeStackScreenProps<RootStackParamList,'JobEditor'>;
const isoDay=(date:Date)=>date.toISOString().slice(0,10);
const label=(value:string)=> <Text style={[s.muted,{marginBottom:5,marginTop:10}]}>{value}</Text>;

export default function JobEditorScreen({route,navigation}:Props) {
  const jobId=route.params?.jobId;
  const {syncNow}=useSync();
  const [title,setTitle]=useState('');
  const [customer,setCustomer]=useState('');
  const [address,setAddress]=useState('');
  const [description,setDescription]=useState('');
  const [date,setDate]=useState(isoDay(new Date()));
  const [busy,setBusy]=useState(false);
  const load=useCallback(async()=>{
    if (!jobId) return;
    const job=await getJob(jobId);
    if (!job) {Alert.alert('Nie znaleziono zlecenia');return;}
    setTitle(job.title);setCustomer(job.customer);setAddress(job.address);
    setDescription(job.description);setDate(job.scheduledAt.slice(0,10));
  },[jobId]);
  useEffect(()=>{void load()},[load]);
  const save=async()=>{
    if (busy) return;
    const parsedDate=new Date(date+'T12:00:00.000Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsedDate.getTime()) || isoDay(parsedDate) !== date) {
      Alert.alert('Niepoprawny termin','Użyj formatu RRRR-MM-DD.');return;
    }
    setBusy(true);
    try {
      const input={title,customer,address,description,scheduledAt:date+'T12:00:00.000Z'};
      if (jobId) await editLocalJob(jobId,input);
      else await createLocalJob(input);
      // Local SQLite write is complete. Network failure cannot undo it.
      navigation.goBack();
      void syncNow();
    } catch(error) {Alert.alert('Nie udało się zapisać lokalnie',String(error));}
    finally {setBusy(false);}
  };
  return <View style={s.screen}>
    <SyncBar/>
    <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.pad}>
        <Text style={s.h1}>{jobId?'Edytuj zlecenie':'Nowe zlecenie'}</Text>
        <Text style={s.muted}>Zapis działa także bez internetu. Zmiany trafią do kolejki synchronizacji.</Text>
        {label('Tytuł zlecenia')}
        <TextInput style={s.input} value={title} onChangeText={setTitle} maxLength={200}/>
        {label('Klient')}
        <TextInput style={s.input} value={customer} onChangeText={setCustomer} maxLength={200}/>
        {label('Adres')}
        <TextInput style={s.input} value={address} onChangeText={setAddress} maxLength={300}/>
        {label('Termin (RRRR-MM-DD)')}
        <TextInput style={s.input} value={date} onChangeText={setDate} placeholder="2026-10-26" autoCapitalize="none"/>
        {label('Opis')}
        <TextInput style={[s.input,{height:100,textAlignVertical:'top',marginBottom:18}]}
          multiline value={description} onChangeText={setDescription} maxLength={5000}/>
        <Btn title={busy?'Zapisywanie…':'Zapisz na telefonie'} busy={busy} onPress={save}/>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}

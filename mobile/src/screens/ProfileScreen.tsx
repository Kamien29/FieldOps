/** Profile editing and avatar upload. Avatars are available online only. */
import React,{useEffect,useState} from 'react';
import {Alert,Image,ScrollView,Text,TextInput,View} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import {apiFetch} from '../api';
import {API_URL} from '../config';
import {Btn} from '../ui';
import {colors,s} from '../theme';

interface Profile {id:string;name:string;email:string;hasAvatar:boolean;}
const MAX_AVATAR=300*1024;
export default function ProfileScreen() {
  const [profile,setProfile]=useState<Profile|null>(null);
  const [token,setToken]=useState('');
  const [name,setName]=useState('');const [email,setEmail]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [confirmPassword,setConfirmPassword]=useState('');
  const [photoVersion,setPhotoVersion]=useState(0);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    SecureStore.getItemAsync('token').then(setToken).catch(()=>{});
    apiFetch<{user:Profile}>('/api/me').then(({user})=>{
      setProfile(user);setName(user.name);setEmail(user.email);
    }).catch(e=>Alert.alert('Profil',String(e)));
  },[]);
  const edit=async()=>{
    if (!name.trim()||!email.includes('@')) return Alert.alert('Profil','Podaj imię i poprawny e-mail.');
    if (newPassword!==confirmPassword) return Alert.alert('Profil','Nowe hasła muszą być identyczne.');
    if (newPassword && newPassword.length<8) return Alert.alert('Profil','Hasło musi mieć co najmniej 8 znaków.');
    if ((email.trim().toLowerCase()!==profile?.email||newPassword) && !currentPassword) {
      return Alert.alert('Profil','Do zmiany e-maila lub hasła podaj obecne hasło.');
    }
    setBusy(true);
    try {
      const {user}=await apiFetch<{user:Profile}>('/api/me',{method:'PATCH',body:{name:name.trim(),email:email.trim().toLowerCase(),
        ...(currentPassword?{currentPassword}:{}),...(newPassword?{newPassword}:{})}});
      setProfile(user);setNewPassword('');setConfirmPassword('');setCurrentPassword('');
      Alert.alert('Profil','Zapisano zmiany.');
    } catch(e) {Alert.alert('Profil',String(e));}
    finally {setBusy(false);}
  };
  const pickAvatar=async()=>{
    setBusy(true);
    try {
      const selected=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],allowsEditing:true,aspect:[1,1],quality:.8});
      if (selected.canceled || !selected.assets?.[0]) return;
      let ready:string|null=null;
      for (const width of [512,384,256]) {
        const result=await ImageManipulator.manipulateAsync(selected.assets[0].uri,[{resize:{width}}],
          {compress:.55,format:ImageManipulator.SaveFormat.JPEG});
        const info=await FileSystem.getInfoAsync(result.uri);
        if (info.exists && typeof info.size==='number' && info.size<=MAX_AVATAR) {ready=result.uri;break;}
      }
      if (!ready) throw new Error('Zdjęcie jest za duże. Spróbuj użyć mniejszego.');
      const base64=await FileSystem.readAsStringAsync(ready,{encoding:FileSystem.EncodingType.Base64});
      await apiFetch('/api/me/avatar',{method:'PUT',body:{mime:'image/jpeg',dataBase64:base64}});
      setProfile(p=>p?{...p,hasAvatar:true}:null);setPhotoVersion(v=>v+1);
      Alert.alert('Profil','Zdjęcie zostało zapisane.');
    }catch(e){Alert.alert('Zdjęcie profilowe',String(e));}
    finally{setBusy(false);}
  };
  const deleteAvatar=async()=>{
    setBusy(true);
    try{
      await apiFetch('/api/me/avatar',{method:'DELETE'});
      setProfile(p=>p?{...p,hasAvatar:false}:null);
      Alert.alert('Profil','Zdjęcie usunięto.');
    }catch(e){Alert.alert('Profil',String(e));}
    finally{setBusy(false);}
  };
  const field=(label:string,value:string,set:(v:string)=>void,secret=false)=><View style={{marginBottom:10}}>
    <Text style={s.muted}>{label}</Text><TextInput style={s.input} value={value} onChangeText={set} secureTextEntry={secret}
      autoCapitalize="none" autoCorrect={false}/>
  </View>;
  return <ScrollView style={s.screen} contentContainerStyle={{padding:18,paddingBottom:40}}>
    <View style={s.card}>
      <Text style={s.h2}>Zdjęcie profilowe</Text>
      {profile?.hasAvatar && !!token && <Image style={{width:110,height:110,borderRadius:55,marginVertical:12,backgroundColor:'#e5e7eb'}}
        source={{uri:`${API_URL}/api/me/avatar?t=${photoVersion}`,headers:{Authorization:`Bearer ${token}`}}}/>}
      {!profile?.hasAvatar && <Text style={[s.muted,{marginBottom:12}]}>Nie dodano jeszcze zdjęcia.</Text>}
      <Btn title="Wybierz zdjęcie" disabled={busy} onPress={()=>void pickAvatar()}/>
      {profile?.hasAvatar&&<Btn title="Usuń zdjęcie" kind="secondary" disabled={busy} onPress={()=>void deleteAvatar()}/>}
      <Text style={[s.muted,{marginTop:10}]}>Format JPEG, zdjęcie zostanie zmniejszone przed wysyłką (do 300 KB).</Text>
    </View>
    <View style={s.card}>
      <Text style={s.h2}>Moje konto</Text>
      {field('Imię i nazwisko',name,setName)}
      {field('E-mail',email,setEmail)}
      <Text style={[s.h2,{marginTop:15}]}>Zmiana hasła</Text>
      {field('Obecne hasło',currentPassword,setCurrentPassword,true)}
      {field('Nowe hasło',newPassword,setNewPassword,true)}
      {field('Powtórz nowe hasło',confirmPassword,setConfirmPassword,true)}
      <Btn title="Zapisz profil" disabled={busy||!profile} onPress={()=>void edit()}/>
      <Text style={[s.muted,{marginTop:8,color:colors.muted}]}>Zmiana e-maila lub hasła wymaga obecnego hasła. Do zapisu potrzebny jest internet.</Text>
    </View>
  </ScrollView>;
}

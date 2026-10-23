import {useState} from 'react';
import {useForm} from 'react-hook-form';
import {zodResolver} from '@hookform/resolvers/zod';
import {z} from 'zod';
import {Bot,ArrowRight} from 'lucide-react';
import {db,configured,errorMessage} from './api';
import {Button} from './ui';
import {ThemeControl} from './ThemeControl';
type Mode='login'|'signup'|'reset'|'update';
export function Auth({recovery=false,onRecovered}:{recovery?:boolean;onRecovered?:()=>void}){
 const [mode,setMode]=useState<Mode>(recovery?'update':'login'),[error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const schema=z.object({email:mode==='update'?z.string():z.string().email('Informe um e-mail válido.'),password:mode==='reset'?z.string():z.string().min(mode==='login'?1:6,mode==='login'?'Informe sua senha.':'Use pelo menos 6 caracteres.')});
 const {register,handleSubmit,formState:{errors},clearErrors}=useForm<{email:string;password:string}>({resolver:zodResolver(schema),defaultValues:{email:'',password:''}});
 const change=(value:Mode)=>{setMode(value);setError('');setNotice('');clearErrors();};
 return <div className="auth-layout"><main className="auth-main"><div className="auth-box"><div className="auth-heading"><div className="brand"><Bot size={24}/>OfertaBot</div><ThemeControl/></div><span className="eyebrow">SEU ESPAÇO DE TRABALHO</span><h2>{mode==='signup'?'Comece sua operação':mode==='reset'?'Recupere seu acesso':mode==='update'?'Defina uma nova senha':'Bem-vindo ao OfertaBot'}</h2><p className="muted">{mode==='login'?'Entre para acompanhar suas ofertas e publicações.':mode==='reset'?'Receba as instruções no seu e-mail.':'Use uma senha de pelo menos 6 caracteres.'}</p>
 {!configured?<div className="notice"><h3>Acesso temporariamente indisponível</h3><p>A configuração do Lovable Cloud não está disponível. Tente novamente em instantes.</p></div>:<form onSubmit={handleSubmit(async({email,password})=>{setBusy(true);setError('');setNotice('');try{if(mode==='login'){const {error}=await db.auth.signInWithPassword({email,password});if(error)throw error;}else if(mode==='signup'){const {data,error}=await db.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin}});if(error)throw error;if(!data.session)setNotice('Confira seu e-mail para confirmar o cadastro e depois entre.');}else if(mode==='reset'){const {error}=await db.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin+'/?recovery=1'});if(error)throw error;setNotice('Se o e-mail estiver cadastrado, você receberá as instruções.');}else{const {error}=await db.auth.updateUser({password});if(error)throw error;onRecovered?.();}}catch(e){setError(errorMessage(e));}finally{setBusy(false);}})} noValidate>
 {mode!=='update'&&<label>E-mail<input aria-label="E-mail" type="email" autoComplete="email" {...register('email')} placeholder="voce@sualoja.com.br" aria-invalid={!!errors.email}/>{errors.email&&<small className="field-error">{errors.email.message}</small>}</label>}
 {mode!=='reset'&&<label>Senha<input aria-label="Senha" type="password" autoComplete={mode==='login'?'current-password':'new-password'} {...register('password')} aria-invalid={!!errors.password}/>{errors.password&&<small className="field-error">{errors.password.message}</small>}</label>}
 <Button type="submit" disabled={busy}>{busy?'Aguarde…':mode==='login'?'Entrar':mode==='signup'?'Criar conta':mode==='reset'?'Enviar recuperação':'Salvar nova senha'}<ArrowRight size={18}/></Button></form>}
 {error&&<p role="alert" className="error">{error}</p>}{notice&&<p role="status" className="notice">{notice}</p>}
 {!recovery&&<div className="auth-links"><Button className="link" onClick={()=>change(mode==='signup'?'login':'signup')}>{mode==='signup'?'Já tenho uma conta':'Criar minha conta'}</Button><Button className="link" onClick={()=>change(mode==='reset'?'login':'reset')}>{mode==='reset'?'Voltar ao login':'Esqueci a senha'}</Button></div>}
 <p className="fine">A vinculação do WhatsApp é feita por você, após entrar.</p></div></main></div>;
}

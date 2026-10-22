/** Restrição opcional de conta. Não envia nem vincula WhatsApp. */
export function normalizeExpectedPhone(value:string|undefined):string|undefined {
 if(!value?.trim())return undefined;
 const phone=value.replace(/[\s()+-]/g,'');
 if(!/^[1-9]\d{7,14}$/.test(phone))throw new Error('ENGINE_EXPECTED_PHONE deve incluir DDI e conter de 8 a 15 dígitos.');
 return phone;
}
export function matchesExpectedAccount(expected:string|undefined,jid:string|undefined):boolean {
 if(!expected)return true;
 const match=/^(\d+)(?::\d+)?@(s\.whatsapp\.net|c\.us)$/.exec(jid??'');
 return match?.[1]===expected;
}

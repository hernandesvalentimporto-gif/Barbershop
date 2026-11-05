#!/usr/bin/env python3
"""Password flows against loopback synthetic accounts and local mail sink only."""
from pathlib import Path
from urllib.parse import urlparse, parse_qs
import hashlib
import json
import re
import subprocess
import requests

BASE='http://127.0.0.1:8085'
MAIL=Path('/home/ubuntu/barber-web-test-mails.jsonl')
checks=0

def check(value,message):
 global checks
 assert value,message
 checks+=1
 print('PASS:',message)

class Browser:
 def __init__(self):
  self.s=requests.Session();self.csrf=None;self.call('session')
 def call(self,action,body=None):
  method='GET' if body is None else 'POST'
  h={'X-CSRF-Token':self.csrf} if self.csrf else {}
  r=self.s.request(method,BASE+'/web-api.php',params={'action':action},json=body,headers=h,timeout=15)
  d=r.json()
  if d.get('csrf'):self.csrf=d['csrf']
  return r.status_code,d
 def login(self,email,password):return self.call('login',{'email':email,'password':password})

b=Browser()
status,known=b.call('forgot_password',{'email':'client3@example.test'})
check(status==200 and known.get('ok'),'forgot password accepted')
check('token' not in known and 'link' not in known,'reset secret not returned to browser')
status,unknown=b.call('forgot_password',{'email':'missing@example.test'})
check(status==200 and known['message']==unknown['message'],'same response for unknown account')
record=json.loads(MAIL.read_text().splitlines()[-1])
link=re.search(r'https?://\S+',record['body']).group(0)
parts=urlparse(link)
token=parse_qs(parts.fragment).get('token',[''])[0]
check(len(token)==64 and 'token' not in parse_qs(parts.query),'reset token uses URL fragment, not server URL')
status,data=b.call('reset_password',{'token':token,'new_password':'ResetLocalPass-2026','new_password_confirm':'ResetLocalPass-2026'})
check(status==200 and data.get('require_login'),'reset changes password')
status,data=b.call('reset_password',{'token':token,'new_password':'RepeatLocalPass-2026','new_password_confirm':'RepeatLocalPass-2026'})
check(status==422,'reset token is single use')
status,data=b.login('client3@example.test','LocalTestPass-2026')
check(status==401,'old password rejected after reset')
status,data=b.login('client3@example.test','ResetLocalPass-2026')
check(status==200 and data.get('user',{}).get('role')=='client','new password works and role preserved')
status,data=b.call('forgot_password',{'email':'client3@example.test'})
record=json.loads(MAIL.read_text().splitlines()[-1]);link=re.search(r'https?://\S+',record['body']).group(0)
expired=parse_qs(urlparse(link).fragment)['token'][0]
hash_value=hashlib.sha256(expired.encode()).hexdigest()
subprocess.run(['sudo','mariadb','--socket=/run/mysqld/barber-test.sock','-u','root','barber_web_test','-e',f"UPDATE bs_password_resets SET expires_at=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 1 MINUTE) WHERE token_hash='{hash_value}'"],check=True,capture_output=True)
status,data=b.call('reset_password',{'token':expired,'new_password':'ExpiredLocalPass-2026','new_password_confirm':'ExpiredLocalPass-2026'})
check(status==422,'expired token rejected')
barber=Browser();status,data=barber.login('barber@example.test','LocalTestPass-2026')
check(status==200,'synthetic barber login before password change')
status,data=barber.call('change_password',{'current_password':'WrongLocalPass','new_password':'ChangedLocalPass-2026','new_password_confirm':'ChangedLocalPass-2026'})
check(status==403,'password change requires correct current password')
status,data=barber.call('change_password',{'current_password':'LocalTestPass-2026','new_password':'ChangedLocalPass-2026','new_password_confirm':'ChangedLocalPass-2026'})
check(status==200 and data.get('require_login'),'password change requires new login')
status,data=barber.call('session')
check(status==200 and data.get('user') is None,'all old sessions revoked for changed password')
status,data=barber.login('barber@example.test','ChangedLocalPass-2026')
check(status==200 and data.get('user',{}).get('role')=='barber','new password works and barber role preserved')
print(f'PASS: {checks} local password checks; no real email sent, no production account changed.')

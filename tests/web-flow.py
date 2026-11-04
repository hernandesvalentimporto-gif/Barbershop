#!/usr/bin/env python3
"""HTTP checks against a loopback synthetic database only. Never targets production."""
import json
import os
import re
from datetime import datetime, timedelta
from pathlib import Path
from urllib.parse import urlparse, parse_qs
from zoneinfo import ZoneInfo
import requests

BASE = 'http://127.0.0.1:8085'
assert urlparse(BASE).hostname in {'127.0.0.1', 'localhost'}
checks = 0

def check(value, message):
    global checks
    assert value, message
    checks += 1
    print('PASS:', message)

class Client:
    def __init__(self):
        self.session = requests.Session()
        self.csrf = None
        self.call('session')
    def call(self, action, method='GET', query=None, body=None, csrf=True):
        headers = {'Accept': 'application/json'}
        if method == 'POST' and csrf and self.csrf:
            headers['X-CSRF-Token'] = self.csrf
        r = self.session.request(method, BASE + '/web-api.php', params={'action':action, **(query or {})}, json=body if method=='POST' else None, headers=headers, timeout=15)
        try: data = r.json()
        except ValueError: raise AssertionError(f'{action}: non-JSON HTTP {r.status_code}')
        if data.get('csrf'): self.csrf = data['csrf']
        return r.status_code, data
    def login(self, email):
        status,data=self.call('login','POST',body={'email':email,'password':'LocalTestPass-2026'})
        check(status==200 and data.get('user'), 'login '+email)
        check('token' not in data, 'bearer not exposed to browser')
        return data

anonymous=Client()
status,data=anonymous.call('users')
check(status==401, 'anonymous cannot read users')
status,data=anonymous.call('login','POST',body={'email':'admin@example.test','password':'LocalTestPass-2026'},csrf=False)
check(status==403, 'login requires CSRF')
admin=Client(); admin.login('admin@example.test')
status,data=admin.call('users',query={'role':'client'})
check(status==200 and len(data.get('users',[]))>=2, 'admin can list real clients')
status,data=admin.call('user_save','POST',body={'name':'Cliente Fluxo','email':'flow@example.test','role':'client','status':'active','password':'FlowTestPass-2026'})
check(status in (200,201) and data.get('user',{}).get('id'), 'admin can create client')
user_id=data['user']['id']
status,data=admin.call('user_save','POST',body={'id':user_id,'name':'Cliente Editado','status':'inactive'})
check(status==200 and data.get('user',{}).get('status')=='inactive', 'admin can edit/inactivate without deleting')
status,data=admin.call('user_save','POST',body={'name':'Invalid Admin','email':'invalid@example.test','role':'admin','status':'active','password':'FlowTestPass-2026'})
check(status in (403,422), 'user_save cannot grant admin')
status,data=admin.call('service_save','POST',body={'name':'Serviço Fluxo','duration_minutes':30,'price_cents':4050,'active':1,'description':'Teste sintético'})
check(status in (200,201) and data.get('service',{}).get('id'), 'service saved with exact cents')
service_id=data['service']['id']
status,data=admin.call('services')
check(status==200 and any(int(x['price_cents'])==4050 for x in data['services']), 'service value survives database round trip')
date=(datetime.now(ZoneInfo('America/Sao_Paulo'))+timedelta(days=1)).date().isoformat()
status,data=admin.call('availability',query={'date':date,'barber_id':2,'service_id':service_id})
check(status==200 and data.get('slots'), 'availability returns real future slots')
slot=data['slots'][0]
payload={'client_id':3,'barber_id':2,'service_id':service_id,'starts_at':slot['starts_at'],'ends_at':slot['ends_at'],'notes':'Teste de fluxo local'}
status,data=admin.call('appointment_create','POST',body=payload)
check(status==201 and data.get('appointment_id'), 'admin can create an appointment for a client')
appointment_id=data['appointment_id']
status,data=admin.call('appointment_create','POST',body=payload)
check(status==409, 'double booking is rejected')
status,data=admin.call('appointment_list',query={'date':date})
check(status==200 and any(x['id']==appointment_id for x in data['appointments']), 'new appointment appears in agenda')
status,data=admin.call('appointment_status','POST',body={'appointment_id':appointment_id,'status':'confirmed'})
check(status==200, 'appointment confirmation saved')
status,data=admin.call('appointment_status','POST',body={'appointment_id':appointment_id,'status':'completed'})
check(status==200, 'appointment completion saved')
client=Client(); client.login('client@example.test')
status,data=client.call('users',query={'role':'client'})
check(status==403, 'client cannot list other clients')
status,data=client.call('history')
check(status==200 and any(x['id']==appointment_id for x in data['appointments']), 'client sees own history')
barber=Client(); barber.login('barber@example.test')
status,data=barber.call('appointment_list',query={'date':date})
check(status==200 and all(x.get('barber_id')==2 for x in data['appointments']), 'barber agenda is scoped to own appointments')
status,data=admin.call('service_save','POST',body={'name':'CSRF Test','duration_minutes':30,'price_cents':100,'active':1},csrf=False)
check(status==403, 'writes require valid CSRF')
status,data=admin.call('logout','POST',body={})
check(status==200, 'logout works')
status,data=admin.call('users')
check(status==401, 'logout invalidates browser session')
print(f'PASS: {checks} synthetic local checks. No production data used or modified.')

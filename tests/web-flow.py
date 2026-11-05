#!/usr/bin/env python3
"""HTTP checks against a loopback synthetic database only. Never targets production."""
from datetime import datetime, timedelta
from urllib.parse import urlparse
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
check({int(x['id']) for x in data['users']} == {3,4}, 'shop A admin sees only shop A clients')
status,data=admin.call('services')
check(status==200 and all(int(x['id'])==1 for x in data['services']), 'shop A admin sees only shop A services')
status,data=admin.call('user_save','POST',body={'name':'Cliente Fluxo','email':'flow@example.test','role':'client','status':'active','password':'FlowTestPass-2026'})
check(status in (200,201) and data.get('user',{}).get('id'), 'admin can create client')
user_id=data['user']['id']
status,data=admin.call('user_save','POST',body={'id':user_id,'name':'Cliente Editado','status':'inactive'})
check(status==200 and data.get('user',{}).get('status')=='inactive', 'admin can edit/inactivate without deleting')
status,data=admin.call('summary')
check(status==200 and data.get('data',{}).get('clients_total')==3 and data['data'].get('clients_active')==1 and data['data'].get('clients_inactive')==2, 'shop A summary counts total, active and inactive clients only within its tenant')
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

# Second synthetic establishment: same API, separate tenant and separate accounts.
admin_b=Client(); admin_b.login('admin2@example.test')
status,data=admin_b.call('users',query={'role':'client'})
check(status==200 and {int(x['id']) for x in data.get('users',[])}=={7,8}, 'shop B admin sees only shop B clients')
status,data=admin_b.call('summary')
check(status==200 and data.get('data',{}).get('clients_total')==2 and data['data'].get('clients_active')==1 and data['data'].get('clients_inactive')==1, 'shop B summary counts its own active and inactive clients')
status,data=admin_b.call('services')
check(status==200 and {int(x['id']) for x in data.get('services',[])}=={2}, 'shop B admin sees only shop B services')
status,data=admin_b.call('catalog')
check(status==200 and {int(x['id']) for x in data.get('services',[])}=={2} and {int(x['id']) for x in data.get('barbers',[])}=={6}, 'shop B catalog contains only its service and barber')
status,data=admin_b.call('availability',query={'date':date,'barber_id':6,'service_id':2})
check(status==200 and data.get('slots'), 'shop B availability uses its own barber and service')
slot_b=data['slots'][0]
payload_b={'client_id':7,'barber_id':6,'service_id':2,'starts_at':slot_b['starts_at'],'ends_at':slot_b['ends_at'],'notes':'Agendamento sintético da barbearia B'}
status,data=admin_b.call('appointment_create','POST',body=payload_b)
check(status==201 and data.get('appointment_id'), 'shop B can create an appointment within its tenant')
appointment_b_id=data['appointment_id']

# The global owner can see real subscription status, commercial customers,
# per-shop operational counts and recent signups, but not made-up payments.
platform=Client(); platform.login('platform@example.test')
status,data=platform.call('platform_dashboard')
metrics=data.get('metrics',{})
check(status==200 and metrics.get('barbershops')==2 and metrics.get('active_subscriptions')==1 and metrics.get('past_due')==1, 'platform dashboard reports shop and paid/past-due subscription totals')
check(metrics.get('total_clients')==5 and metrics.get('active_clients')==2 and metrics.get('inactive_clients')==3, 'platform dashboard reports real total, active and inactive client counts')
check({item['name'] for item in data.get('recent_signups',[])}=={'Barbearia Teste A','Barbearia Teste B'}, 'platform dashboard lists the recent synthetic shop signups')
status,data=platform.call('platform_customers')
shops={int(item['id']):item for item in data.get('customers',[])}
check(status==200 and set(shops)=={1,2}, 'platform admin sees both commercial shops')
check(shops[1].get('subscription_status')=='active' and shops[2].get('subscription_status')=='past_due', 'platform admin can distinguish paying from past-due subscriptions')
check(shops[1].get('total_clients')==3 and shops[1].get('active_clients')==1 and shops[1].get('inactive_clients')==2, 'shop A customer counts are isolated in the commercial list')
check(shops[2].get('total_clients')==2 and shops[2].get('active_clients')==1 and shops[2].get('inactive_clients')==1, 'shop B customer counts are isolated in the commercial list')
check(shops[1].get('owner_name')=='Administrador Teste A' and shops[1].get('owner_email')=='admin@example.test', 'commercial customer list exposes the correct shop owner contact')
status,details=platform.call('platform_customer_details',query={'barbershop_id':1})
check(status==200 and details.get('barbershop',{}).get('name')=='Barbearia Teste A' and details['barbershop'].get('owner_email')=='admin@example.test', 'platform admin can open full commercial shop details')
check({user['email'] for user in details.get('users',[])} >= {'admin@example.test','barber@example.test','client@example.test'}, 'shop detail includes its own tenant user accounts')
status,details_other=admin.call('platform_customer_details',query={'barbershop_id':1})
check(status==403, 'barbershop admin cannot access master commercial customer details')
status,missing=platform.call('platform_customer_details',query={'barbershop_id':999})
check(status==404, 'master detail returns not found for a nonexistent shop')

# Cross-tenant reads and writes must fail or return only tenant-local records.
status,data=admin.call('appointment_list',query={'date':date})
check(status==200 and all(int(x['id'])!=int(appointment_b_id) for x in data.get('appointments',[])), 'shop A agenda does not reveal shop B appointments')
status,data=admin_b.call('appointment_list',query={'date':date})
check(status==200 and {int(x['id']) for x in data.get('appointments',[])}=={int(appointment_b_id)}, 'shop B agenda contains only shop B appointments')
status,data=admin.call('availability',query={'date':date,'barber_id':6,'service_id':2})
check(status==404, 'shop A cannot query shop B barber availability')
status,data=admin.call('appointment_create','POST',body=payload_b)
check(status==404, 'shop A cannot create an appointment using shop B records')
status,data=admin.call('appointment_status','POST',body={'appointment_id':appointment_b_id,'status':'confirmed'})
check(status==404, 'shop A cannot change shop B appointment status')
status,data=admin.call('appointment_cancel','POST',body={'appointment_id':appointment_b_id})
check(status==404, 'shop A cannot cancel shop B appointment')

status,data=admin.call('appointment_create','POST',body=payload)
check(status==409, 'double booking is rejected')
status,data=admin.call('appointment_list',query={'date':date})
check(status==200 and any(int(x['id'])==int(appointment_id) for x in data['appointments']) and all(int(x['id'])!=int(appointment_b_id) for x in data['appointments']), 'shop A agenda shows its own appointment only')
status,data=admin.call('appointment_status','POST',body={'appointment_id':appointment_id,'status':'confirmed'})
check(status==200, 'appointment confirmation saved')
status,data=admin.call('appointment_status','POST',body={'appointment_id':appointment_id,'status':'completed'})
check(status==200, 'appointment completion saved')
client=Client(); client.login('client@example.test')
status,data=client.call('users',query={'role':'client'})
check(status==403, 'client cannot list other clients')
status,data=client.call('history')
check(status==200 and any(int(x['id'])==int(appointment_id) for x in data['appointments']) and all(int(x['id'])!=int(appointment_b_id) for x in data['appointments']), 'shop A client history is tenant-scoped')
barber=Client(); barber.login('barber@example.test')
status,data=barber.call('appointment_list',query={'date':date})
check(status==200 and all(int(x.get('barber_id'))==2 for x in data['appointments']), 'barber agenda is scoped to own appointments')
client_b=Client(); client_b.login('client3@example.test')
status,data=client_b.call('history')
check(status==200 and {int(x['id']) for x in data['appointments']}=={int(appointment_b_id)}, 'shop B client history contains only its own appointment')
barber_b=Client(); barber_b.login('barber2@example.test')
status,data=barber_b.call('appointment_list',query={'date':date})
check(status==200 and {int(x['id']) for x in data['appointments']}=={int(appointment_b_id)}, 'shop B barber agenda contains only its own appointment')
status,data=admin.call('service_save','POST',body={'name':'CSRF Test','duration_minutes':30,'price_cents':100,'active':1},csrf=False)
check(status==403, 'writes require valid CSRF')
status,data=admin.call('logout','POST',body={})
check(status==200, 'logout works')
status,data=admin.call('users')
check(status==401, 'logout invalidates browser session')
print(f'PASS: {checks} synthetic local checks across two shops and the global admin. No production data used or modified.')

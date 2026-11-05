#!/usr/bin/env python3
"""Create only an isolated loopback test database; never reads production config."""
from pathlib import Path
import json
import secrets
import subprocess
import os

root = Path(__file__).resolve().parent.parent
socket = '/run/mysqld/barber-test.sock'
db_name = 'barber_web_test'
db_user = 'barber_web_test'
db_password = secrets.token_urlsafe(24)
mysql = ['sudo', 'mariadb', '--socket=' + socket, '-u', 'root']
subprocess.run(mysql + ['-e', f"DROP DATABASE IF EXISTS `{db_name}`; CREATE DATABASE `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS '{db_user}'@'127.0.0.1' IDENTIFIED BY '{db_password}'; ALTER USER '{db_user}'@'127.0.0.1' IDENTIFIED BY '{db_password}'; GRANT ALL ON `{db_name}`.* TO '{db_user}'@'127.0.0.1';"], check=True)
subprocess.run(mysql + [db_name], input=(root / 'tests/schema.sql').read_text(), text=True, check=True)

# Apply the same checked-in migrations as the application. The two synthetic
# shops exist before migration 002 so legacy backfill is deterministic.
shops = """
INSERT INTO bs_barbershops (id, name, phone, address) VALUES
(1, 'Barbearia Teste A', '0000000001', 'Endereço sintético A'),
(2, 'Barbearia Teste B', '0000000002', 'Endereço sintético B');
"""
subprocess.run(mysql + [db_name], input=shops, text=True, check=True)
for migration in ('001_saas_foundation.sql', '002_multi_tenant_isolation.sql'):
    subprocess.run(mysql + [db_name], input=(root / 'migrations' / migration).read_text(), text=True, check=True)

password_hash = subprocess.check_output(['php', '-r', "echo password_hash('LocalTestPass-2026', PASSWORD_BCRYPT);"], text=True)
fixture = f"""
INSERT INTO bs_users (id,barbershop_id,name,email,password_hash,role,status,platform_admin) VALUES
(1,1,'Administrador Teste A','admin@example.test','{password_hash}','admin','active',0),
(2,1,'Barbeiro Teste A','barber@example.test','{password_hash}','barber','active',0),
(3,1,'Cliente Teste A','client@example.test','{password_hash}','client','active',0),
(4,1,'Cliente Inativo Teste A','client2@example.test','{password_hash}','client','inactive',0),
(5,2,'Administrador Teste B','admin2@example.test','{password_hash}','admin','active',0),
(6,2,'Barbeiro Teste B','barber2@example.test','{password_hash}','barber','active',0),
(7,2,'Cliente Teste B','client3@example.test','{password_hash}','client','active',0),
(8,2,'Cliente Inativo Teste B','client4@example.test','{password_hash}','client','inactive',0),
(9,NULL,'Administrador Global de Teste','platform@example.test','{password_hash}','admin','active',1);
INSERT INTO bs_services (id,barbershop_id,name,description,duration_minutes,price_cents,active) VALUES
(1,1,'Corte Teste A','Serviço sintético A',30,3500,1),
(2,2,'Corte Teste B','Serviço sintético B',45,5000,1);
UPDATE bs_subscriptions SET status='active', plan_id=1, current_period_start=UTC_TIMESTAMP(), current_period_end=DATE_ADD(UTC_TIMESTAMP(), INTERVAL 30 DAY) WHERE barbershop_id=1;
UPDATE bs_subscriptions SET status='past_due', plan_id=1, current_period_start=DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY), current_period_end=UTC_TIMESTAMP() WHERE barbershop_id=2;
"""
subprocess.run(mysql + [db_name], input=fixture, text=True, check=True)
config = {
 'app': {'name':'Barber Shop Sistemas HP','base_url':'http://127.0.0.1:8085','environment':'local_test'},
 'database': {'host':'127.0.0.1','port':3307,'name':db_name,'user':db_user,'password':db_password,'charset':'utf8mb4','table_prefix':'bs_'},
 'security': {'app_key':secrets.token_urlsafe(48),'allowed_origins':['http://127.0.0.1:8085']},
}
php_config = subprocess.check_output(['php','-r', "echo '<?php return ' . var_export(json_decode(stream_get_contents(STDIN),true),true) . ';' . PHP_EOL;"], input=json.dumps(config), text=True)
(root / 'config.php').write_text(php_config)
os.chmod(root / 'config.php', 0o600)
(root / '.installed').write_text('local synthetic test only\n')
print('PASS: local synthetic database ready with two isolated shops, one global administrator, and paid/unpaid sample subscriptions; config.php remains ignored and private.')

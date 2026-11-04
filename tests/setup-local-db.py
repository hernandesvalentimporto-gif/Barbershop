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
subprocess.run(mysql + ['-e', f"CREATE DATABASE IF NOT EXISTS `{db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS '{db_user}'@'127.0.0.1' IDENTIFIED BY '{db_password}'; ALTER USER '{db_user}'@'127.0.0.1' IDENTIFIED BY '{db_password}'; GRANT ALL ON `{db_name}`.* TO '{db_user}'@'127.0.0.1';"], check=True)
subprocess.run(mysql + [db_name], input=(root / 'tests/schema.sql').read_text(), text=True, check=True)
password_hash = subprocess.check_output(['php', '-r', "echo password_hash('LocalTestPass-2026', PASSWORD_BCRYPT);"], text=True)
fixture = f"""
INSERT INTO bs_users (id,name,email,password_hash,role,status) VALUES
(1,'Administrador Teste','admin@example.test','{password_hash}','admin','active'),
(2,'Barbeiro Teste','barber@example.test','{password_hash}','barber','active'),
(3,'Cliente Teste','client@example.test','{password_hash}','client','active'),
(4,'Outro Cliente Teste','client2@example.test','{password_hash}','client','active');
INSERT INTO bs_services (id,name,description,duration_minutes,price_cents,active)
VALUES (1,'Corte Teste','Serviço sintético',30,3500,1);
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
print('PASS: local synthetic database ready; config.php remains ignored and private.')
